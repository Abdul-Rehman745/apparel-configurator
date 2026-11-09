//#region src/core/design.ts
var hasArtwork = (a) => !!a && a.objects.some((o) => o.visible);
/** Units ordered: bulk rows when enabled, otherwise the single size × quantity. */
function orderUnits(d) {
	if (d.bulk.enabled && d.bulk.rows.length) return d.bulk.rows.map((r) => ({
		sizeId: r.sizeId,
		qty: r.qty,
		personalized: !!(r.name || r.number),
		row: r
	}));
	return [{
		sizeId: d.sizeId,
		qty: d.quantity,
		personalized: false
	}];
}
var totalQty = (d) => orderUnits(d).reduce((s, u) => s + u.qty, 0);
//#endregion
//#region src/print-areas/dpi.ts
/** effective DPI = source pixels / printed inches. `sizeScale` accounts for print size scaling with garment size. */
function effectiveDpi(naturalPx, displayUnits, sizeScale = 1) {
	const inches = displayUnits / 50 * sizeScale;
	return inches > 0 ? naturalPx / inches : Infinity;
}
function imageDpi(img, sizeScale = 1) {
	return Math.min(effectiveDpi(img.naturalW, img.displayW, sizeScale), effectiveDpi(img.naturalH, img.displayH, sizeScale));
}
/** Largest printed width (inches) at which an image still meets `dpi`. */
var maxPrintInches = (naturalPx, dpi) => naturalPx / dpi;
//#endregion
//#region src/products/lookup.ts
function resolve(catalog, d) {
	const product = catalog.products.find((p) => p.id === d.productId) ?? catalog.products[0];
	return {
		product,
		model: product.models.find((m) => m.id === d.modelId) ?? product.models[0],
		method: catalog.printMethods.find((m) => m.id === d.methodId) ?? catalog.printMethods.find((m) => m.id === product.defaultMethod),
		material: catalog.materials.find((m) => m.id === d.materialId) ?? catalog.materials.find((m) => m.id === product.materials[0]),
		size: product.sizes.find((s) => s.id === d.sizeId) ?? product.sizes.find((s) => s.id === product.referenceSize) ?? product.sizes[0]
	};
}
/** Print size multiplier for the chosen garment size (1 unless product scales print with size). */
function sizeScale(product, sizeId) {
	if (product.printSizing !== "scale") return 1;
	return product.sizes.find((s) => s.id === sizeId)?.scale ?? 1;
}
//#endregion
//#region src/validation/validate.ts
var policySeverity = (p) => p === "block" ? "error" : p === "approval" ? "approval" : "warning";
var inch = (units) => units / 50;
var fmt = (n) => (Math.round(n * 10) / 10).toString();
function overlaps(b, r) {
	const x = r.xIn * 50, y = r.yIn * 50, w = r.wIn * 50, h = r.hIn * 50;
	return b.x < x + w && b.x + b.w > x && b.y < y + h && b.y + b.h > y;
}
/** Normalise hex colours so #FFF, #ffffff and rgb() strings compare equal. */
function normColor(c) {
	const s = c.trim().toLowerCase();
	const m3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(s);
	if (m3) return `#${m3[1]}${m3[1]}${m3[2]}${m3[2]}${m3[3]}${m3[3]}`;
	const rgb = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(s);
	if (rgb) return "#" + rgb.slice(1, 4).map((v) => (+v).toString(16).padStart(2, "0")).join("");
	return s;
}
function validateDesign(catalog, d, opts = {}) {
	const issues = [];
	const { product, model, method, material } = resolve(catalog, d);
	const pol = catalog.validation;
	const scale = sizeScale(product, d.sizeId);
	const add = (i) => issues.push(i);
	if (!product.printMethods.includes(method.id)) add({
		id: "method-product",
		severity: "error",
		message: `${method.label} is not offered on the ${product.title}.`
	});
	if (method.materials && !method.materials.includes(material.id)) add({
		id: "method-material",
		severity: "error",
		message: `${method.label} can't be printed on ${material.label}. Choose ${method.materials.map((m) => catalog.materials.find((x) => x.id === m)?.label ?? m).join(" or ")}, or another print method.`
	});
	const customized = model.printAreas.filter((a) => hasArtwork(d.areas[a.id]));
	if (!customized.length) add({
		id: "blank",
		severity: "warning",
		message: "No artwork added yet — this will be ordered as a blank garment."
	});
	for (const area of customized) {
		const doc = d.areas[area.id];
		const W = area.rect.wIn * 50, H = area.rect.hIn * 50;
		const inset = area.safeInsetIn * 50, bleed = area.bleedIn * 50;
		const label = area.label;
		if (!area.methods.includes(method.id)) add({
			id: `area-method-${area.id}`,
			severity: policySeverity(pol.methodLimits),
			areaId: area.id,
			message: `${label} can't be decorated with ${method.label}. Move the artwork or pick one of: ${area.methods.map((m) => catalog.printMethods.find((x) => x.id === m)?.label ?? m).join(", ")}.`
		});
		for (const other of area.conflictsWith ?? []) if (hasArtwork(d.areas[other]) && area.id < other) {
			const o = model.printAreas.find((a) => a.id === other);
			add({
				id: `conflict-${area.id}-${other}`,
				severity: "error",
				areaId: area.id,
				message: `${label} and ${o?.label ?? other} overlap on the garment — use only one of them.`
			});
		}
		const colors = /* @__PURE__ */ new Set();
		let hasRaster = false;
		for (const o of doc.objects) {
			if (!o.visible) continue;
			const name = `“${o.name}”`;
			const b = o.bbox;
			o.colors.forEach((c) => colors.add(normColor(c)));
			if (o.kind === "image" || o.kind === "pattern") hasRaster = true;
			if (b.x < -bleed - .5 || b.y < -bleed - .5 || b.x + b.w > W + bleed + .5 || b.y + b.h > H + bleed + .5) add({
				id: `bounds-${o.id}`,
				severity: policySeverity(pol.outOfBounds),
				areaId: area.id,
				objectId: o.id,
				message: `${name} extends outside the ${label} print area and would be cut off. Move it inside or make it smaller.`
			});
			else if (b.x < inset || b.y < inset || b.x + b.w > W - inset || b.y + b.h > H - inset) add({
				id: `safe-${o.id}`,
				severity: "warning",
				areaId: area.id,
				objectId: o.id,
				message: `${name} is within ${fmt(area.safeInsetIn)}" of the ${label} edge — small shifts in production may trim it.`
			});
			for (const ex of area.exclusions) if (overlaps(b, ex)) add({
				id: `excl-${o.id}-${ex.id}`,
				severity: policySeverity(pol.exclusion),
				areaId: area.id,
				objectId: o.id,
				message: `${name} overlaps the ${ex.label.toLowerCase()} on ${label}, which can't be printed. Move it off the red zone.`
			});
			if (o.image) {
				const dpi = imageDpi(o.image, scale);
				const printedW = inch(o.image.displayW) * scale;
				if (method.goodDpi && dpi < method.minDpi) add({
					id: `dpi-${o.id}`,
					severity: policySeverity(pol.lowDpi),
					areaId: area.id,
					objectId: o.id,
					message: `${name} is ${Math.round(dpi)} DPI at ${fmt(printedW)}" wide. Reduce it to ${fmt(maxPrintInches(o.image.naturalW, method.minDpi))}" or upload a higher-resolution image.`
				});
				else if (method.goodDpi && dpi < method.goodDpi) add({
					id: `dpi-${o.id}`,
					severity: "warning",
					areaId: area.id,
					objectId: o.id,
					message: `${name} is ${Math.round(dpi)} DPI — acceptable, but ${method.goodDpi} DPI (≤ ${fmt(maxPrintInches(o.image.naturalW, method.goodDpi))}" wide) prints sharper.`
				});
			}
			if ((o.kind === "image" || o.kind === "pattern") && !method.artwork.includes("raster")) add({
				id: `raster-${o.id}`,
				severity: policySeverity(pol.methodLimits),
				areaId: area.id,
				objectId: o.id,
				message: `${method.label} can't reproduce photos or raster images like ${name}. Use text/vector artwork or switch to DTF.`
			});
			if (o.kind === "text" && method.minTextHeightIn && o.textHeightIn !== void 0 && o.textHeightIn * scale < method.minTextHeightIn) add({
				id: `text-${o.id}`,
				severity: policySeverity(pol.methodLimits),
				areaId: area.id,
				objectId: o.id,
				message: `Text ${name} is ${fmt(o.textHeightIn * scale)}" tall; ${method.label} needs at least ${method.minTextHeightIn}". Increase the font size.`
			});
			if (method.minLineIn && o.minStrokeIn !== void 0 && o.minStrokeIn > 0 && o.minStrokeIn * scale < method.minLineIn) add({
				id: `line-${o.id}`,
				severity: "warning",
				areaId: area.id,
				objectId: o.id,
				message: `Outline on ${name} is thinner than ${method.minLineIn}" and may not reproduce with ${method.label}.`
			});
			if (o.hasShadow && !method.allowsShadow) add({
				id: `shadow-${o.id}`,
				severity: policySeverity(pol.methodLimits),
				areaId: area.id,
				objectId: o.id,
				message: `${method.label} can't print the shadow on ${name}. Remove the shadow.`
			});
			if (o.hasGradient && !method.allowsGradient) add({
				id: `grad-${o.id}`,
				severity: policySeverity(pol.methodLimits),
				areaId: area.id,
				objectId: o.id,
				message: `${method.label} can't print gradients (${name}). Use a solid colour.`
			});
			if (method.maxAreaIn && (inch(b.w) * scale > method.maxAreaIn.w || inch(b.h) * scale > method.maxAreaIn.h)) add({
				id: `maxarea-${o.id}`,
				severity: policySeverity(pol.methodLimits),
				areaId: area.id,
				objectId: o.id,
				message: `${name} is ${fmt(inch(b.w))}×${fmt(inch(b.h))}"; ${method.label} is limited to ${method.maxAreaIn.w}×${method.maxAreaIn.h}".`
			});
			if (area.maxArtworkIn && (inch(b.w) > area.maxArtworkIn.w || inch(b.h) > area.maxArtworkIn.h)) add({
				id: `areamax-${o.id}`,
				severity: "error",
				areaId: area.id,
				objectId: o.id,
				message: `${name} exceeds the ${area.maxArtworkIn.w}×${area.maxArtworkIn.h}" maximum for ${label}.`
			});
			if (method.palette) {
				const pal = new Set(method.palette.map(normColor));
				const off = o.colors.map(normColor).filter((c) => !pal.has(c));
				if (off.length) add({
					id: `palette-${o.id}`,
					severity: policySeverity(pol.methodLimits),
					areaId: area.id,
					objectId: o.id,
					message: `${name} uses ${off.join(", ")}, which isn't an available thread colour. Pick a colour from the thread palette.`
				});
			}
			if (o.required && (o.kind === "text" ? !o.text?.trim() : false)) add({
				id: `req-${o.id}`,
				severity: "error",
				areaId: area.id,
				objectId: o.id,
				message: `${name} is required — please fill it in.`
			});
			if (o.assetId && opts.missingAssets?.has(o.assetId)) add({
				id: `asset-${o.id}`,
				severity: "error",
				areaId: area.id,
				objectId: o.id,
				message: `The image for ${name} is missing. Re-upload it.`
			});
			if (o.fontFamily && opts.knownFonts && !opts.knownFonts.has(o.fontFamily)) add({
				id: `font-${o.id}`,
				severity: "error",
				areaId: area.id,
				objectId: o.id,
				message: `Font “${o.fontFamily}” used by ${name} isn't available. Choose another font.`
			});
		}
		if (method.maxColors) {
			if (hasRaster && method.id === "screen") add({
				id: `sep-${area.id}`,
				severity: "approval",
				areaId: area.id,
				message: `Screen printing a photo on ${label} needs manual colour separation; our team will review before production.`
			});
			else if (colors.size > method.maxColors) add({
				id: `colors-${area.id}`,
				severity: policySeverity(pol.methodLimits),
				areaId: area.id,
				message: `${label} uses ${colors.size} colours; ${method.label} allows ${method.maxColors}. Reduce colours or choose DTF/DTG.`
			});
		}
	}
	for (const [areaId, doc] of Object.entries(d.areas)) if (!model.printAreas.some((a) => a.id === areaId) && doc.objects.length) add({
		id: `orphan-${areaId}`,
		severity: "warning",
		message: `Artwork on “${areaId}” isn't available on the ${model.label} and won't be printed.`
	});
	const qty = totalQty(d);
	if (qty < (product.minQty ?? 1)) add({
		id: "qty-min",
		severity: "error",
		message: `Minimum order is ${product.minQty ?? 1}.`
	});
	if (product.maxQty && qty > product.maxQty) add({
		id: "qty-max",
		severity: "error",
		message: `Maximum order is ${product.maxQty}; contact us for larger runs.`
	});
	for (const u of orderUnits(d)) {
		const s = product.sizes.find((x) => x.id === u.sizeId);
		if (!s) add({
			id: `size-${u.sizeId}`,
			severity: "error",
			message: `Please choose a size${u.row ? ` for ${u.row.name || "each row"}` : ""}.`
		});
		else if (s.inStock === false) add({
			id: `stock-${s.id}`,
			severity: "error",
			message: `Size ${s.label} is out of stock.`
		});
	}
	if (d.bulk.enabled) {
		const fields = new Set(Object.values(d.areas).flatMap((a) => a.objects.map((o) => o.bulkField).filter(Boolean)));
		d.bulk.rows.forEach((r, i) => {
			if (fields.has("name") && !r.name.trim()) add({
				id: `bulk-name-${r.id}`,
				severity: "error",
				message: `Row ${i + 1}: enter a name.`
			});
			if (fields.has("number") && !r.number.trim()) add({
				id: `bulk-num-${r.id}`,
				severity: "error",
				message: `Row ${i + 1}: enter a number.`
			});
			if (r.qty < 1) add({
				id: `bulk-qty-${r.id}`,
				severity: "error",
				message: `Row ${i + 1}: quantity must be at least 1.`
			});
		});
		if (!fields.size) add({
			id: "bulk-nofields",
			severity: "warning",
			message: "Bulk rows are set, but no text layer is linked to Name or Number — every shirt will be identical."
		});
	}
	return issues;
}
var blocking = (issues) => issues.filter((i) => i.severity === "error");
var needsApproval = (issues) => issues.some((i) => i.severity === "approval");
//#endregion
//#region src/pricing/pricing.ts
var round = (n) => Math.round(n * 100) / 100;
function matches(rule, input, sizeId, group) {
	const w = rule.when;
	if (!w) return true;
	if (w.productIds && !w.productIds.includes(input.productId)) return false;
	if (w.modelIds && !w.modelIds.includes(input.modelId)) return false;
	if (w.materialIds && !w.materialIds.includes(input.materialId)) return false;
	if (w.methodIds && !w.methodIds.includes(input.methodId)) return false;
	if (w.sizeIds && (!sizeId || !w.sizeIds.includes(sizeId))) return false;
	if (w.areaGroups && (!group || !w.areaGroups.includes(group))) return false;
	return true;
}
function computePrice(cfg, input) {
	const quantity = input.units.reduce((s, u) => s + Math.max(0, u.qty), 0);
	const lines = [];
	const push = (rule, qty, unitAmount = rule.amount, discountable = true) => {
		if (qty > 0 && unitAmount !== 0) lines.push({
			ruleId: rule.id,
			label: rule.label,
			unitAmount,
			qty,
			total: round(unitAmount * qty),
			discountable
		});
	};
	const decorated = input.areas.length > 0;
	for (const rule of cfg.rules) switch (rule.per) {
		case "unit":
			if (rule.when?.sizeIds) push(rule, input.units.filter((u) => matches(rule, input, u.sizeId)).reduce((s, u) => s + u.qty, 0));
			else if (matches(rule, input)) push(rule, quantity);
			break;
		case "area": {
			const n = input.areas.filter((a) => matches(rule, input, void 0, a.group)).length;
			if (n) push(rule, quantity, rule.amount * n);
			break;
		}
		case "color": {
			const colors = input.areas.filter((a) => matches(rule, input, void 0, a.group)).reduce((s, a) => s + a.colorCount, 0);
			if (colors) push(rule, quantity, rule.amount * colors);
			break;
		}
		case "order":
			if (decorated && matches(rule, input) && quantity > 0) push(rule, 1, rule.amount, false);
			break;
		case "personalizedUnit":
			if (matches(rule, input)) push(rule, input.units.filter((u) => u.personalized).reduce((s, u) => s + u.qty, 0));
			break;
		case "premiumAsset": if (input.premiumAssets && matches(rule, input)) push(rule, quantity, rule.amount * input.premiumAssets);
	}
	const subtotal = round(lines.reduce((s, l) => s + l.total, 0));
	const tier = [...cfg.tiers].sort((a, b) => a.minQty - b.minQty).filter((t) => quantity >= t.minQty).pop() ?? {
		label: "—",
		pctOff: 0
	};
	const discount = round(lines.filter((l) => l.discountable).reduce((s, l) => s + l.total, 0) * tier.pctOff / 100);
	const total = round(subtotal - discount);
	return {
		currency: cfg.currency,
		lines,
		subtotal,
		tier: {
			label: tier.label,
			pctOff: tier.pctOff
		},
		discount,
		total,
		quantity,
		unitPrice: quantity ? round(total / quantity) : 0
	};
}
//#endregion
//#region src/pricing/priceInput.ts
/** Derives the pricing engine's input from the design document (the only place that knows both). */
function priceInput(catalog, d) {
	const { product, model, method, material } = resolve(catalog, d);
	const areas = model.printAreas.filter((a) => hasArtwork(d.areas[a.id])).map((a) => {
		const colors = new Set(d.areas[a.id].objects.filter((o) => o.visible).flatMap((o) => o.colors.map(normColor)));
		return {
			id: a.id,
			group: a.group,
			colorCount: Math.max(1, colors.size)
		};
	});
	const premiumAssets = new Set(Object.values(d.areas).flatMap((a) => a.objects.filter((o) => o.premium && o.visible).map((o) => o.name))).size;
	const personalized = Object.values(d.areas).some((a) => a.objects.some((o) => o.bulkField && o.visible));
	return {
		productId: product.id,
		modelId: model.id,
		materialId: material.id,
		methodId: method.id,
		units: orderUnits(d).map((u) => ({
			sizeId: u.sizeId,
			qty: u.qty,
			personalized: u.personalized && personalized
		})),
		areas,
		premiumAssets
	};
}
//#endregion
//#region src/state/serialize.ts
var DesignLoadError = class extends Error {};
/** migrations[n] upgrades schemaVersion n → n+1. Never edit a shipped migration; append a new one. */
var migrations = { 1: (d) => {
	const { color, printMethod, ...rest } = d;
	return {
		...rest,
		colors: rest.colors ?? { body: color ?? "white" },
		methodId: rest.methodId ?? printMethod,
		bulk: rest.bulk ?? {
			enabled: false,
			rows: []
		},
		schemaVersion: 2
	};
} };
function migrate(raw) {
	let d = raw;
	let v = typeof d.schemaVersion === "number" ? d.schemaVersion : 1;
	if (v > 2) throw new DesignLoadError(`Design was saved by a newer version (schema ${v}).`);
	while (v < 2) {
		const m = migrations[v];
		if (!m) throw new DesignLoadError(`No migration from schema ${v}.`);
		d = m(d);
		v = d.schemaVersion;
	}
	return d;
}
function deserializeDesign(text) {
	let raw;
	try {
		raw = JSON.parse(text);
	} catch {
		throw new DesignLoadError("Saved design is corrupted (invalid JSON).");
	}
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new DesignLoadError("Saved design is corrupted.");
	const d = migrate(raw);
	for (const k of [
		"productId",
		"modelId",
		"sizeId",
		"materialId",
		"methodId"
	]) if (typeof d[k] !== "string") throw new DesignLoadError(`Saved design is missing “${k}”.`);
	if (typeof d.quantity !== "number" || !d.areas || typeof d.areas !== "object") throw new DesignLoadError("Saved design is incomplete.");
	for (const [id, a] of Object.entries(d.areas)) if (!a || !Array.isArray(a.objects)) throw new DesignLoadError(`Area “${id}” is corrupted.`);
	return d;
}
//#endregion
//#region src/3d/garmentMath.ts
var ELLIPSE_SAMPLES = 96;
/** Arc length of ellipse (a sinθ, b cosθ) from θ0 to θ1. */
function arcLength(a, b, t0, t1, n = ELLIPSE_SAMPLES) {
	let len = 0;
	let px = a * Math.sin(t0), pz = b * Math.cos(t0);
	for (let i = 1; i <= n; i++) {
		const t = t0 + (t1 - t0) * i / n;
		const x = a * Math.sin(t), z = b * Math.cos(t);
		len += Math.hypot(x - px, z - pz);
		px = x;
		pz = z;
	}
	return len;
}
function bodyDims(g) {
	const drop = g.drop ?? 1;
	const a = .402 * g.chestIn * drop;
	const b = a * (g.kind === "hoodie" ? .6 : .55);
	const L = g.lengthIn;
	const neckA = g.collar === "hood" ? 3.8 : 3.4;
	return {
		a,
		b,
		L,
		neckA,
		neckB: neckA * .88,
		shoulder: g.kind === "tank" ? .72 : .97
	};
}
/** Key rings from hem (y=0) to neck (y=L). */
function bodyKeyRings(g) {
	const { a, b, L, neckA, neckB, shoulder } = bodyDims(g);
	const as = a * shoulder, drop = 2.2;
	const slope = [
		.18,
		.4,
		.6,
		.8,
		.93,
		1
	].map((t) => ({
		y: L - drop * (1 - t),
		a: as + (neckA - as) * t,
		b: b * .9 + (neckB - b * .9) * t
	}));
	return [
		{
			y: 0,
			a: a * .99,
			b: b * .98
		},
		{
			y: L * .35,
			a,
			b
		},
		{
			y: L * .66,
			a,
			b
		},
		{
			y: L - drop - 1.2,
			a: a * Math.max(shoulder, .985),
			b: b * .96
		},
		{
			y: L - drop,
			a: as,
			b: b * .9
		},
		...slope
	];
}
function ringAt(rings, y) {
	if (y <= rings[0].y) return rings[0];
	for (let i = 1; i < rings.length; i++) {
		const r0 = rings[i - 1], r1 = rings[i];
		if (y <= r1.y) {
			const t = (y - r0.y) / (r1.y - r0.y);
			const s = t * t * (3 - 2 * t);
			return {
				y,
				a: r0.a + (r1.a - r0.a) * s,
				b: r0.b + (r1.b - r0.b) * s
			};
		}
	}
	return rings[rings.length - 1];
}
/** Rows sampled from neck (index 0) down to hem, with distance-from-top along the front centre line. */
function bodyRows(g, count = 64) {
	const rings = bodyKeyRings(g);
	const { L } = bodyDims(g);
	const rows = [];
	let d = 0;
	const top = Math.min(4, L / 4), nTop = Math.round(count * .3);
	const ys = [...Array.from({ length: nTop }, (_, i) => L - top * i / nTop), ...Array.from({ length: count - nTop + 1 }, (_, i) => L - top - (L - top) * i / (count - nTop))];
	for (let i = 0; i < ys.length; i++) {
		const y = ys[i];
		const r = ringAt(rings, y);
		if (i > 0) {
			const p = rows[i - 1];
			d += Math.hypot(p.y - r.y, p.b - r.b);
		}
		rows.push({
			...r,
			dTop: d
		});
	}
	return rows;
}
function sleeveDims(g) {
	if (g.kind === "tank" || g.sleeveLengthIn <= 0) return null;
	const { a, L, shoulder } = bodyDims(g);
	const long = g.sleeveLengthIn > 14;
	const r0 = .2 * a + 1.55;
	const r1 = long ? 1.9 : r0 * .9;
	const angle = long ? .32 : .95;
	const attach = {
		x: a * shoulder * .93,
		y: L - 2.2 - r0 * .55
	};
	return {
		r0,
		r1,
		length: g.sleeveLengthIn,
		angle,
		attach,
		long
	};
}
var CUFF_LENGTH = 2.5;
var COLLAR_HEIGHT = 1.8;
function measureGarment(g) {
	const { a, b, L } = bodyDims(g);
	const rows = bodyRows(g);
	const halfW = arcLength(a, b, -Math.PI / 2, Math.PI / 2);
	const h = rows[rows.length - 1].dTop;
	const s = sleeveDims(g);
	const hasCuff = !!(s && g.cuffs);
	const collar = g.collar === "polo" || g.collar === "dress";
	const neck = bodyDims(g);
	return {
		height: L + (g.collar === "hood" ? 10 : collar ? COLLAR_HEIGHT : 0),
		front: {
			w: halfW,
			h
		},
		back: {
			w: halfW,
			h
		},
		sleeve: s ? {
			w: 2 * Math.PI * s.r0,
			h: s.length
		} : null,
		cuff: hasCuff && s ? {
			w: 2 * Math.PI * s.r1 * 1.04,
			h: CUFF_LENGTH
		} : null,
		collar: collar ? {
			w: arcLength(neck.neckA * 1.05, neck.neckB * 1.05, 0, Math.PI * 2),
			h: COLLAR_HEIGHT
		} : null
	};
}
//#endregion
//#region src/products/modelFactory.ts
var INTERNAL_LICENSE = {
	source: "internal",
	author: "Generated in-code (procedural geometry)",
	license: "Proprietary – owned by platform operator",
	attributionRequired: false,
	redistribution: "embedded-only",
	modifications: "n/a – authored in-house"
};
var ALL = [
	"dtg",
	"dtf",
	"screen",
	"vinyl"
];
var SMALL = [
	"dtg",
	"dtf",
	"screen",
	"vinyl",
	"embroidery"
];
/** Area centred horizontally at cx with its top edge at top (panel inches). */
function centred(cx, top, w, h) {
	return {
		xIn: cx - w / 2,
		yIn: top,
		wIn: w,
		hIn: h
	};
}
/** Intersect a panel-space rect with an area rect, returning it in area-local coordinates. */
function localExclusion(area, ex, id, label, kind) {
	const x0 = Math.max(area.xIn, ex.xIn), y0 = Math.max(area.yIn, ex.yIn);
	const x1 = Math.min(area.xIn + area.wIn, ex.xIn + ex.wIn), y1 = Math.min(area.yIn + area.hIn, ex.yIn + ex.hIn);
	if (x1 <= x0 || y1 <= y0) return null;
	return {
		id,
		label,
		kind,
		xIn: x0 - area.xIn,
		yIn: y0 - area.yIn,
		wIn: x1 - x0,
		hIn: y1 - y0
	};
}
function proceduralModel(opts) {
	const model = buildModel(opts);
	if (!opts.glb) return model;
	return {
		...model,
		source: {
			type: "glb",
			url: opts.glb,
			unit: "m",
			garment: opts.garment
		},
		panels: model.panels.map((p) => ({
			...p,
			mesh: `shirt_${p.id}`
		})),
		license: SEWN_LICENSE
	};
}
var SEWN_LICENSE = {
	...INTERNAL_LICENSE,
	author: "Generated in-house: pattern drafting + Blender cloth simulation (models/sew_garment.py)"
};
function buildModel({ id, label, garment: g, allOver, multiZone }) {
	const m = measureGarment(g);
	const zone = (z) => multiZone ? z : "body";
	const panels = [
		{
			id: "front",
			label: "Front",
			widthIn: m.front.w,
			heightIn: m.front.h,
			colorZone: "body"
		},
		{
			id: "back",
			label: "Back",
			widthIn: m.back.w,
			heightIn: m.back.h,
			colorZone: "body"
		},
		{
			id: "back_inside",
			label: "Inside back",
			widthIn: m.back.w,
			heightIn: m.back.h,
			colorZone: "body"
		}
	];
	if (m.sleeve) {
		panels.push({
			id: "left_sleeve",
			label: "Left sleeve",
			widthIn: m.sleeve.w,
			heightIn: m.sleeve.h,
			colorZone: zone("sleeves")
		});
		panels.push({
			id: "right_sleeve",
			label: "Right sleeve",
			widthIn: m.sleeve.w,
			heightIn: m.sleeve.h,
			colorZone: zone("sleeves")
		});
	}
	if (m.cuff) {
		panels.push({
			id: "left_cuff",
			label: "Left cuff",
			widthIn: m.cuff.w,
			heightIn: m.cuff.h,
			colorZone: zone("cuffs")
		});
		panels.push({
			id: "right_cuff",
			label: "Right cuff",
			widthIn: m.cuff.w,
			heightIn: m.cuff.h,
			colorZone: zone("cuffs")
		});
	}
	if (m.collar) panels.push({
		id: "collar",
		label: "Collar",
		widthIn: m.collar.w,
		heightIn: m.collar.h,
		colorZone: zone("collar")
	});
	const colorZones = [{
		id: "body",
		label: "Body"
	}];
	if (multiZone) {
		if (m.sleeve) colorZones.push({
			id: "sleeves",
			label: "Sleeves"
		});
		if (m.cuff) colorZones.push({
			id: "cuffs",
			label: "Cuffs"
		});
		if (m.collar) colorZones.push({
			id: "collar",
			label: "Collar"
		});
	}
	const fw = m.front.w, cx = fw / 2;
	const { L } = bodyDims(g);
	const obstacles = [];
	if (g.placket) {
		const len = g.collar === "dress" ? m.front.h : 7;
		obstacles.push({
			rect: centred(cx, 0, 1.6, len),
			label: g.collar === "dress" ? "Button placket" : "Polo placket",
			kind: "button"
		});
	}
	if (g.pocket) {
		const top = m.front.h - L * .4;
		obstacles.push({
			rect: centred(cx, top, 13, L * .3),
			label: "Kangaroo pocket",
			kind: "pocket"
		});
	}
	const withObstacles = (rect, panel) => panel === "front" ? obstacles.flatMap((o, i) => localExclusion(rect, o.rect, `ob${i}`, o.label, o.kind) ?? []) : [];
	const areas = [];
	const add = (a) => areas.push({
		safeInsetIn: .25,
		bleedIn: 0,
		...a,
		exclusions: [...a.exclusions ?? [], ...withObstacles(a.rect, a.panel)]
	});
	if (allOver) {
		const seam = (w, h) => [
			{
				id: "seamL",
				label: "Side seam",
				kind: "seam",
				xIn: 0,
				yIn: 0,
				wIn: .6,
				hIn: h
			},
			{
				id: "seamR",
				label: "Side seam",
				kind: "seam",
				xIn: w - .6,
				yIn: 0,
				wIn: .6,
				hIn: h
			},
			{
				id: "neck",
				label: "Collar",
				kind: "collar",
				xIn: w / 2 - 4.2,
				yIn: 0,
				wIn: 8.4,
				hIn: 1.6
			},
			{
				id: "hem",
				label: "Hem stitching",
				kind: "stitching",
				xIn: 0,
				yIn: h - .8,
				wIn: w,
				hIn: .8
			}
		];
		for (const p of ["front", "back"]) {
			const pw = m[p].w, ph = m[p].h;
			add({
				id: `${p}_allover`,
				label: p === "front" ? "Front (all-over)" : "Back (all-over)",
				panel: p,
				rect: {
					xIn: 0,
					yIn: 0,
					wIn: pw,
					hIn: ph
				},
				bleedIn: .5,
				safeInsetIn: .75,
				methods: ["sublimation"],
				camera: p,
				group: "allover",
				exclusions: seam(pw, ph)
			});
		}
		if (m.sleeve) for (const s of ["left_sleeve", "right_sleeve"]) add({
			id: `${s}_allover`,
			label: s === "left_sleeve" ? "Left sleeve (all-over)" : "Right sleeve (all-over)",
			panel: s,
			rect: {
				xIn: 0,
				yIn: 0,
				wIn: m.sleeve.w,
				hIn: m.sleeve.h
			},
			bleedIn: .5,
			safeInsetIn: .5,
			methods: ["sublimation"],
			camera: s,
			group: "allover",
			exclusions: [{
				id: "armpit",
				label: "Underarm seam",
				kind: "armpit",
				xIn: 0,
				yIn: 0,
				wIn: 1,
				hIn: m.sleeve.h
			}, {
				id: "armpit2",
				label: "Underarm seam",
				kind: "armpit",
				xIn: m.sleeve.w - 1,
				yIn: 0,
				wIn: 1,
				hIn: m.sleeve.h
			}]
		});
		return {
			id,
			label,
			source: {
				type: "procedural",
				garment: g
			},
			panels,
			colorZones,
			printAreas: areas,
			license: INTERNAL_LICENSE
		};
	}
	const bigW = Math.min(12, fw - 6);
	const bigTop = g.collar === "hood" ? 5 : 4;
	const bigH = g.pocket ? Math.min(14, m.front.h - L * .4 - bigTop - .5) : Math.min(14, m.front.h - bigTop - 6);
	const chestOff = Math.min(4.5, fw / 2 - 3);
	const chestTop = g.collar === "hood" ? 5.5 : 4.2;
	if (g.collar !== "dress") add({
		id: "full_front",
		label: "Full front",
		panel: "front",
		rect: centred(cx, bigTop, bigW, bigH),
		methods: [...ALL],
		camera: "front",
		group: "large",
		conflictsWith: ["left_chest", "right_chest"]
	});
	add({
		id: "left_chest",
		label: "Left chest",
		panel: "front",
		rect: centred(cx + chestOff, chestTop, 4, 4),
		methods: [...SMALL],
		camera: "front",
		group: "small",
		conflictsWith: g.collar !== "dress" ? ["full_front"] : []
	});
	add({
		id: "right_chest",
		label: "Right chest",
		panel: "front",
		rect: centred(cx - chestOff, chestTop, 4, 4),
		methods: [...SMALL],
		camera: "front",
		group: "small",
		conflictsWith: g.collar !== "dress" ? ["full_front"] : []
	});
	const bw = m.back.w, bcx = bw / 2;
	add({
		id: "full_back",
		label: "Full back",
		panel: "back",
		rect: centred(bcx, 5, bigW, Math.min(14, m.back.h - 11)),
		methods: [...ALL],
		camera: "back",
		group: "large",
		conflictsWith: ["upper_back", "lower_back"]
	});
	add({
		id: "upper_back",
		label: "Upper back",
		panel: "back",
		rect: centred(bcx, 3.2, Math.min(11, bw - 6), 3),
		methods: [...SMALL],
		camera: "back",
		group: "small",
		conflictsWith: ["full_back"]
	});
	add({
		id: "lower_back",
		label: "Lower back",
		panel: "back",
		rect: centred(bcx, m.back.h - 7.5, Math.min(11, bw - 6), 3),
		methods: [...ALL],
		camera: "back",
		group: "small",
		conflictsWith: ["full_back"]
	});
	if (g.collar !== "hood") {
		add({
			id: "outside_neck",
			label: "Outside neck",
			panel: "back",
			rect: centred(bcx, 1.1, 3, 1.3),
			methods: [
				"dtg",
				"dtf",
				"screen",
				"embroidery"
			],
			camera: "back",
			group: "label",
			safeInsetIn: .1
		});
		add({
			id: "inside_neck",
			label: "Inside neck label",
			panel: "back_inside",
			rect: centred(bcx, 1.1, 3, 2),
			methods: [
				"dtg",
				"dtf",
				"screen"
			],
			camera: "neck",
			group: "label",
			safeInsetIn: .1
		});
	}
	if (m.sleeve) {
		const sw = m.sleeve.w, long = m.sleeve.h > 14;
		const w = long ? 3 : 3.5, h = long ? Math.min(14, m.sleeve.h - 5) : Math.min(3.5, m.sleeve.h - 2.5);
		add({
			id: "left_sleeve",
			label: "Left sleeve",
			panel: "left_sleeve",
			rect: centred(sw / 2, 1.6, w, h),
			methods: [...SMALL],
			camera: "left_sleeve",
			group: "sleeve"
		});
		add({
			id: "right_sleeve",
			label: "Right sleeve",
			panel: "right_sleeve",
			rect: centred(sw / 2, 1.6, w, h),
			methods: [...SMALL],
			camera: "right_sleeve",
			group: "sleeve"
		});
	}
	if (m.cuff) {
		add({
			id: "left_cuff",
			label: "Left cuff",
			panel: "left_cuff",
			rect: centred(m.cuff.w / 2, .55, 2.6, 1.4),
			methods: [
				"embroidery",
				"dtf",
				"vinyl"
			],
			camera: "left_sleeve",
			group: "label",
			safeInsetIn: .1
		});
		add({
			id: "right_cuff",
			label: "Right cuff",
			panel: "right_cuff",
			rect: centred(m.cuff.w / 2, .55, 2.6, 1.4),
			methods: [
				"embroidery",
				"dtf",
				"vinyl"
			],
			camera: "right_sleeve",
			group: "label",
			safeInsetIn: .1
		});
	}
	if (m.collar) add({
		id: "collar",
		label: "Collar",
		panel: "collar",
		rect: centred(m.collar.w / 2, .35, 4, 1.1),
		methods: ["embroidery", "dtf"],
		camera: "neck",
		group: "label",
		safeInsetIn: .1
	});
	return {
		id,
		label,
		source: {
			type: "procedural",
			garment: g
		},
		panels,
		colorZones,
		printAreas: areas,
		license: INTERNAL_LICENSE
	};
}
//#endregion
//#region src/products/defaultCatalog.ts
/** Garment sewn from its pattern with cloth simulation (models/sew_garment.py); same panels and print areas. */
var sewn = (o) => proceduralModel({
	...o,
	glb: `/models/sewn/${o.id}.glb`
});
var ADULT_SIZES = [
	{
		id: "XS",
		label: "XS",
		chestIn: 17,
		lengthIn: 27,
		sleeveIn: 7.5,
		shoulderIn: 16,
		sku: "XS",
		scale: .88
	},
	{
		id: "S",
		label: "S",
		chestIn: 18.5,
		lengthIn: 28,
		sleeveIn: 8,
		shoulderIn: 17,
		sku: "S",
		scale: .94
	},
	{
		id: "M",
		label: "M",
		chestIn: 20,
		lengthIn: 29,
		sleeveIn: 8.25,
		shoulderIn: 18,
		sku: "M",
		scale: 1
	},
	{
		id: "L",
		label: "L",
		chestIn: 22,
		lengthIn: 30,
		sleeveIn: 8.5,
		shoulderIn: 19.5,
		sku: "L",
		scale: 1.06
	},
	{
		id: "XL",
		label: "XL",
		chestIn: 24,
		lengthIn: 31,
		sleeveIn: 8.75,
		shoulderIn: 21,
		sku: "XL",
		scale: 1.12
	},
	{
		id: "2XL",
		label: "2XL",
		chestIn: 26,
		lengthIn: 32,
		sleeveIn: 9,
		shoulderIn: 22.5,
		sku: "2XL",
		scale: 1.18
	},
	{
		id: "3XL",
		label: "3XL",
		chestIn: 28,
		lengthIn: 33,
		sleeveIn: 9.25,
		shoulderIn: 24,
		sku: "3XL",
		scale: 1.24
	}
];
var longSleeve = (sizes) => sizes.map((s) => ({
	...s,
	sleeveIn: s.sleeveIn + 16.5
}));
var withSku = (prefix, sizes) => sizes.map((s) => ({
	...s,
	sku: `${prefix}-${s.id}`
}));
var KIDS_SIZES = [
	{
		id: "3-4Y",
		label: "3–4 yrs",
		chestIn: 13,
		lengthIn: 17,
		sleeveIn: 4.5,
		sku: "K-34",
		scale: .8
	},
	{
		id: "5-6Y",
		label: "5–6 yrs",
		chestIn: 14,
		lengthIn: 19,
		sleeveIn: 5,
		sku: "K-56",
		scale: .9
	},
	{
		id: "7-8Y",
		label: "7–8 yrs",
		chestIn: 15,
		lengthIn: 20.5,
		sleeveIn: 5.5,
		sku: "K-78",
		scale: 1
	},
	{
		id: "9-11Y",
		label: "9–11 yrs",
		chestIn: 16.5,
		lengthIn: 22.5,
		sleeveIn: 6,
		sku: "K-911",
		scale: 1.08
	},
	{
		id: "12-13Y",
		label: "12–13 yrs",
		chestIn: 17.5,
		lengthIn: 24,
		sleeveIn: 6.5,
		sku: "K-1213",
		scale: 1.16
	}
];
var CORE_COLORS = [
	{
		id: "white",
		name: "White",
		hex: "#f4f4f1",
		mfrId: "00"
	},
	{
		id: "black",
		name: "Black",
		hex: "#1c1c1e",
		mfrId: "36"
	},
	{
		id: "navy",
		name: "Navy",
		hex: "#1f2a44",
		mfrId: "32"
	},
	{
		id: "royal",
		name: "Royal Blue",
		hex: "#2250a8",
		mfrId: "51"
	},
	{
		id: "red",
		name: "Red",
		hex: "#b3202c",
		mfrId: "40"
	},
	{
		id: "forest",
		name: "Forest Green",
		hex: "#26452f",
		mfrId: "33"
	},
	{
		id: "heather",
		name: "Heather Grey",
		hex: "#a7a8aa",
		mfrId: "RS"
	},
	{
		id: "sand",
		name: "Sand",
		hex: "#d8c7a6",
		mfrId: "6E"
	},
	{
		id: "maroon",
		name: "Maroon",
		hex: "#5a1f2b",
		mfrId: "38"
	},
	{
		id: "gold",
		name: "Gold",
		hex: "#e2a927",
		mfrId: "24"
	}
];
var tee = {
	kind: "tee",
	chestIn: 20,
	lengthIn: 28,
	sleeveLengthIn: 8,
	collar: "crew"
};
var box = (cx, top, w, h) => ({
	xIn: cx - w / 2,
	yIn: top,
	wIn: w,
	hIn: h
});
var REAL_TEE = {
	id: "real-tee",
	label: "Scanned Tee (CC0)",
	source: {
		type: "glb",
		url: "/models/tshirt-cc0-hanging.glb"
	},
	panels: [
		{
			id: "front",
			label: "Front",
			mesh: "shirt_front",
			widthIn: 19.32,
			heightIn: 25.35,
			colorZone: "body"
		},
		{
			id: "back",
			label: "Back",
			mesh: "shirt_back",
			widthIn: 19.08,
			heightIn: 25.35,
			colorZone: "body"
		},
		{
			id: "left_sleeve",
			label: "Left sleeve",
			mesh: "shirt_left_sleeve",
			widthIn: 8.62,
			heightIn: 7.1,
			colorZone: "body"
		},
		{
			id: "right_sleeve",
			label: "Right sleeve",
			mesh: "shirt_right_sleeve",
			widthIn: 8.7,
			heightIn: 7.05,
			colorZone: "body"
		}
	],
	colorZones: [{
		id: "body",
		label: "Body"
	}],
	printAreas: [
		{
			id: "full_front",
			label: "Full front",
			panel: "front",
			rect: box(9.66, 4.5, 12, 14),
			safeInsetIn: .25,
			bleedIn: 0,
			exclusions: [],
			methods: [
				"dtg",
				"dtf",
				"screen",
				"vinyl"
			],
			camera: "front",
			group: "large",
			conflictsWith: ["left_chest", "right_chest"]
		},
		{
			id: "left_chest",
			label: "Left chest",
			panel: "front",
			rect: box(14.16, 5, 4, 4),
			safeInsetIn: .25,
			bleedIn: 0,
			exclusions: [],
			methods: [
				"dtg",
				"dtf",
				"screen",
				"vinyl",
				"embroidery"
			],
			camera: "front",
			group: "small",
			conflictsWith: ["full_front"]
		},
		{
			id: "right_chest",
			label: "Right chest",
			panel: "front",
			rect: box(5.16, 5, 4, 4),
			safeInsetIn: .25,
			bleedIn: 0,
			exclusions: [],
			methods: [
				"dtg",
				"dtf",
				"screen",
				"vinyl",
				"embroidery"
			],
			camera: "front",
			group: "small",
			conflictsWith: ["full_front"]
		},
		{
			id: "full_back",
			label: "Full back",
			panel: "back",
			rect: box(9.54, 5, 12, 14),
			safeInsetIn: .25,
			bleedIn: 0,
			exclusions: [],
			methods: [
				"dtg",
				"dtf",
				"screen",
				"vinyl"
			],
			camera: "back",
			group: "large",
			conflictsWith: ["upper_back"]
		},
		{
			id: "upper_back",
			label: "Upper back",
			panel: "back",
			rect: box(9.54, 3.5, 11, 3),
			safeInsetIn: .25,
			bleedIn: 0,
			exclusions: [],
			methods: [
				"dtg",
				"dtf",
				"screen",
				"vinyl",
				"embroidery"
			],
			camera: "back",
			group: "small",
			conflictsWith: ["full_back"]
		},
		{
			id: "left_sleeve",
			label: "Left sleeve",
			panel: "left_sleeve",
			rect: box(4.31, 3, 3, 2),
			safeInsetIn: .25,
			bleedIn: 0,
			exclusions: [],
			methods: [
				"dtg",
				"dtf",
				"screen",
				"vinyl",
				"embroidery"
			],
			camera: "left_sleeve",
			group: "sleeve"
		},
		{
			id: "right_sleeve",
			label: "Right sleeve",
			panel: "right_sleeve",
			rect: box(4.35, 3, 3, 2),
			safeInsetIn: .25,
			bleedIn: 0,
			exclusions: [],
			methods: [
				"dtg",
				"dtf",
				"screen",
				"vinyl",
				"embroidery"
			],
			camera: "right_sleeve",
			group: "sleeve"
		}
	],
	license: {
		source: "cc0",
		author: "3D Assets (3dassets.dev)",
		license: "CC0-1.0",
		url: "https://3dassets.dev/assets/clothing-rail-and-wardrobe-tshirt-on-hanger-c0e0e17d",
		downloadedAt: "2026-09-24",
		attributionRequired: false,
		redistribution: "allowed",
		modifications: "Hanger meshes removed; split into front/back/sleeve panels; print UVs generated (models/prepare_tshirt.py). SHA256 of original: A2FA84A62DC7A856835DA14741F94A148DB3AA1E1C76B99A57000F1A9436B4A8."
	}
};
var defaultCatalog = {
	schemaVersion: 1,
	products: [
		{
			id: "tshirt",
			slug: "t-shirt",
			title: "Classic T-Shirt",
			category: "T-Shirts",
			published: true,
			description: "Everyday crew-neck tee in three fits, sewn from real patterns.",
			models: [
				sewn({
					id: "basic-tee",
					label: "Basic Tee",
					garment: { ...tee }
				}),
				sewn({
					id: "premium-tee",
					label: "Premium Tee",
					garment: {
						...tee,
						lengthIn: 29,
						chestIn: 20.5
					}
				}),
				sewn({
					id: "oversized-tee",
					label: "Oversized Tee",
					garment: {
						...tee,
						lengthIn: 30,
						sleeveLengthIn: 10,
						drop: 1.14
					}
				}),
				REAL_TEE
			],
			sizes: withSku("TEE", ADULT_SIZES),
			referenceSize: "M",
			colors: CORE_COLORS,
			multiZoneColors: false,
			materials: [
				"cotton",
				"blend",
				"polyester"
			],
			printMethods: [
				"dtg",
				"dtf",
				"screen",
				"vinyl",
				"embroidery"
			],
			defaultMethod: "dtg",
			printSizing: "constant"
		},
		{
			id: "longsleeve",
			slug: "long-sleeve",
			title: "Long Sleeve Tee",
			category: "T-Shirts",
			published: true,
			description: "Crew neck with rib cuffs; sleeve and cuff print zones.",
			models: [sewn({
				id: "longsleeve",
				label: "Long Sleeve",
				garment: {
					kind: "longsleeve",
					chestIn: 20,
					lengthIn: 28.5,
					sleeveLengthIn: 23,
					collar: "crew",
					cuffs: true
				},
				multiZone: true
			})],
			sizes: withSku("LS", longSleeve(ADULT_SIZES)),
			referenceSize: "M",
			colors: CORE_COLORS,
			multiZoneColors: true,
			materials: ["cotton", "blend"],
			printMethods: [
				"dtg",
				"dtf",
				"screen",
				"vinyl",
				"embroidery"
			],
			defaultMethod: "dtg",
			printSizing: "constant"
		},
		{
			id: "polo",
			slug: "polo",
			title: "Piqué Polo",
			category: "Polos",
			published: true,
			description: "Three-button placket polo, ideal for embroidered logos.",
			models: [sewn({
				id: "polo",
				label: "Polo",
				garment: {
					kind: "polo",
					chestIn: 20.5,
					lengthIn: 28.5,
					sleeveLengthIn: 8.5,
					collar: "polo",
					placket: true
				},
				multiZone: true
			})],
			sizes: withSku("POLO", ADULT_SIZES),
			referenceSize: "M",
			colors: CORE_COLORS,
			multiZoneColors: true,
			materials: ["pique", "performance"],
			printMethods: [
				"embroidery",
				"dtf",
				"vinyl",
				"screen"
			],
			defaultMethod: "embroidery",
			printSizing: "constant"
		},
		{
			id: "hoodie",
			slug: "hoodie",
			title: "Pullover Hoodie",
			category: "Sweats",
			published: true,
			description: "Heavyweight fleece hoodie with kangaroo pocket.",
			models: [sewn({
				id: "hoodie",
				label: "Hoodie",
				garment: {
					kind: "hoodie",
					chestIn: 22,
					lengthIn: 27.5,
					sleeveLengthIn: 24,
					collar: "hood",
					pocket: true,
					cuffs: true
				},
				multiZone: true
			})],
			sizes: withSku("HD", longSleeve(ADULT_SIZES)),
			referenceSize: "M",
			colors: CORE_COLORS,
			multiZoneColors: true,
			materials: ["fleece"],
			printMethods: [
				"dtg",
				"dtf",
				"screen",
				"embroidery",
				"vinyl"
			],
			defaultMethod: "dtf",
			printSizing: "constant"
		},
		{
			id: "sweatshirt",
			slug: "sweatshirt",
			title: "Crew Sweatshirt",
			category: "Sweats",
			published: true,
			description: "Classic crew sweatshirt with rib cuffs.",
			models: [sewn({
				id: "sweatshirt",
				label: "Sweatshirt",
				garment: {
					kind: "longsleeve",
					chestIn: 22,
					lengthIn: 27,
					sleeveLengthIn: 24,
					collar: "crew",
					cuffs: true
				},
				multiZone: true
			})],
			sizes: withSku("SW", longSleeve(ADULT_SIZES)),
			referenceSize: "M",
			colors: CORE_COLORS,
			multiZoneColors: true,
			materials: ["fleece"],
			printMethods: [
				"dtg",
				"dtf",
				"screen",
				"embroidery"
			],
			defaultMethod: "dtf",
			printSizing: "constant"
		},
		{
			id: "tank",
			slug: "tank-top",
			title: "Tank Top",
			category: "T-Shirts",
			published: true,
			description: "Sleeveless training tank.",
			models: [sewn({
				id: "tank",
				label: "Tank",
				garment: {
					kind: "tank",
					chestIn: 19.5,
					lengthIn: 28.5,
					sleeveLengthIn: 0,
					collar: "crew"
				}
			})],
			sizes: withSku("TK", ADULT_SIZES),
			referenceSize: "M",
			colors: CORE_COLORS,
			multiZoneColors: false,
			materials: ["cotton", "performance"],
			printMethods: [
				"dtg",
				"dtf",
				"screen",
				"vinyl"
			],
			defaultMethod: "dtg",
			printSizing: "constant"
		},
		{
			id: "dress-shirt",
			slug: "dress-shirt",
			title: "Oxford Dress Shirt",
			category: "Shirts",
			published: true,
			description: "Button-front shirt with collar and cuffs; chest and cuff embroidery.",
			models: [sewn({
				id: "dress-shirt",
				label: "Dress Shirt",
				garment: {
					kind: "dress",
					chestIn: 21,
					lengthIn: 30,
					sleeveLengthIn: 24,
					collar: "dress",
					placket: true,
					cuffs: true
				},
				multiZone: true
			})],
			sizes: withSku("DS", longSleeve(ADULT_SIZES)),
			referenceSize: "M",
			colors: CORE_COLORS.filter((c) => [
				"white",
				"navy",
				"royal",
				"black",
				"heather"
			].includes(c.id)),
			multiZoneColors: true,
			materials: ["poplin"],
			printMethods: ["embroidery", "dtf"],
			defaultMethod: "embroidery",
			printSizing: "constant"
		},
		{
			id: "workwear",
			slug: "workwear-shirt",
			title: "Workwear Shirt",
			category: "Workwear",
			published: true,
			description: "Durable twill work shirt for uniforms.",
			models: [sewn({
				id: "workwear",
				label: "Work Shirt",
				garment: {
					kind: "dress",
					chestIn: 22.5,
					lengthIn: 30,
					sleeveLengthIn: 9,
					collar: "dress",
					placket: true,
					drop: 1.05
				}
			})],
			sizes: withSku("WW", ADULT_SIZES),
			referenceSize: "M",
			colors: CORE_COLORS.filter((c) => [
				"navy",
				"black",
				"heather",
				"sand",
				"forest"
			].includes(c.id)),
			multiZoneColors: false,
			materials: ["twill"],
			printMethods: [
				"embroidery",
				"dtf",
				"screen"
			],
			defaultMethod: "embroidery",
			printSizing: "constant"
		},
		{
			id: "jersey",
			slug: "sports-jersey",
			title: "Sublimated Sports Jersey",
			category: "Sportswear",
			published: true,
			description: "Edge-to-edge sublimated performance jersey for teams.",
			models: [sewn({
				id: "jersey",
				label: "Sports Jersey",
				garment: {
					kind: "tee",
					chestIn: 21,
					lengthIn: 29,
					sleeveLengthIn: 8.5,
					collar: "v"
				},
				allOver: true
			})],
			sizes: withSku("JS", ADULT_SIZES),
			referenceSize: "M",
			colors: CORE_COLORS.filter((c) => c.id === "white"),
			multiZoneColors: false,
			materials: ["performance"],
			printMethods: ["sublimation"],
			defaultMethod: "sublimation",
			printSizing: "scale",
			minQty: 1
		},
		{
			id: "sports-tee",
			slug: "sports-shirt",
			title: "Performance Sports Shirt",
			category: "Sportswear",
			published: true,
			description: "Moisture-wicking tee for names and numbers.",
			models: [sewn({
				id: "sports-tee",
				label: "Sports Shirt",
				garment: {
					kind: "tee",
					chestIn: 20.5,
					lengthIn: 28.5,
					sleeveLengthIn: 8,
					collar: "v"
				}
			})],
			sizes: withSku("ST", ADULT_SIZES),
			referenceSize: "M",
			colors: CORE_COLORS,
			multiZoneColors: false,
			materials: ["performance", "polyester"],
			printMethods: [
				"dtf",
				"vinyl",
				"screen"
			],
			defaultMethod: "vinyl",
			printSizing: "constant"
		},
		{
			id: "kids-tee",
			slug: "kids-t-shirt",
			title: "Kids T-Shirt",
			category: "Kids",
			published: true,
			description: "Soft cotton tee for kids.",
			models: [sewn({
				id: "kids-tee",
				label: "Kids Tee",
				garment: {
					kind: "tee",
					chestIn: 15,
					lengthIn: 20.5,
					sleeveLengthIn: 5.5,
					collar: "crew"
				}
			})],
			sizes: KIDS_SIZES,
			referenceSize: "7-8Y",
			colors: CORE_COLORS,
			multiZoneColors: false,
			materials: ["cotton"],
			printMethods: [
				"dtg",
				"dtf",
				"vinyl"
			],
			defaultMethod: "dtg",
			printSizing: "scale"
		}
	],
	fonts: [
		["Inter", "Sans Serif"],
		["Montserrat", "Sans Serif"],
		[
			"Roboto",
			"Sans Serif",
			"Apache-2.0"
		],
		["Poppins", "Sans Serif"],
		["Archivo", "Sans Serif"],
		["Playfair Display", "Serif"],
		["Merriweather", "Serif"],
		["Lora", "Serif"],
		["DM Serif Display", "Serif"],
		["Bebas Neue", "Display"],
		["Anton", "Display"],
		["Bungee", "Display"],
		["Righteous", "Display"],
		["Pacifico", "Script"],
		["Dancing Script", "Script"],
		["Lobster", "Script"],
		["Great Vibes", "Script"],
		["Oswald", "Sports"],
		["Teko", "Sports"],
		["Russo One", "Sports"],
		["Saira Condensed", "Sports"],
		["Graduate", "College"],
		["Alfa Slab One", "College"],
		["Staatliches", "College"],
		["Rye", "Vintage"],
		["Abril Fatface", "Vintage"],
		[
			"Special Elite",
			"Vintage",
			"Apache-2.0"
		],
		["Caveat", "Handwritten"],
		[
			"Permanent Marker",
			"Handwritten",
			"Apache-2.0"
		],
		["Kalam", "Handwritten"],
		["JetBrains Mono", "Monospace"],
		["Space Mono", "Monospace"]
	].map(([family, category, license]) => ({
		family,
		category,
		license: license ?? "OFL-1.1",
		source: "google"
	})),
	materials: [
		{
			id: "cotton",
			label: "100% Ringspun Cotton",
			description: "Soft, breathable jersey",
			weave: "jersey",
			roughness: .93,
			sheen: .55,
			normalScale: .35
		},
		{
			id: "blend",
			label: "Cotton / Poly Blend",
			description: "Smoother, less shrinkage",
			weave: "jersey",
			roughness: .88,
			sheen: .45,
			normalScale: .28
		},
		{
			id: "polyester",
			label: "100% Polyester",
			description: "Bright colours, quick dry",
			weave: "jersey",
			roughness: .78,
			sheen: .35,
			normalScale: .22
		},
		{
			id: "performance",
			label: "Performance Mesh",
			description: "Breathable technical mesh",
			weave: "mesh",
			roughness: .72,
			sheen: .3,
			normalScale: .5
		},
		{
			id: "fleece",
			label: "Brushed Fleece",
			description: "Heavyweight, warm",
			weave: "fleece",
			roughness: 1,
			sheen: .9,
			normalScale: .2
		},
		{
			id: "pique",
			label: "Cotton Piqué",
			description: "Textured polo knit",
			weave: "pique",
			roughness: .92,
			sheen: .5,
			normalScale: .55
		},
		{
			id: "poplin",
			label: "Oxford Poplin",
			description: "Crisp woven shirting",
			weave: "poplin",
			roughness: .82,
			sheen: .3,
			normalScale: .25
		},
		{
			id: "twill",
			label: "Heavy Twill",
			description: "Hard-wearing work fabric",
			weave: "twill",
			roughness: .9,
			sheen: .25,
			normalScale: .45
		}
	],
	printMethods: [
		{
			id: "dtg",
			label: "DTG",
			description: "Direct-to-garment full colour, soft hand feel",
			finish: "soft",
			artwork: [
				"text",
				"raster",
				"vector"
			],
			minDpi: 150,
			goodDpi: 300,
			allowsShadow: true,
			allowsGradient: true,
			materials: [
				"cotton",
				"blend",
				"fleece",
				"pique"
			]
		},
		{
			id: "dtf",
			label: "DTF Transfer",
			description: "Full colour film transfer, works on most fabrics",
			finish: "matte",
			artwork: [
				"text",
				"raster",
				"vector"
			],
			minDpi: 150,
			goodDpi: 300,
			allowsShadow: true,
			allowsGradient: true
		},
		{
			id: "screen",
			label: "Screen Print",
			description: "Spot colours, most durable for bulk",
			finish: "matte",
			artwork: [
				"text",
				"vector",
				"raster"
			],
			minDpi: 200,
			goodDpi: 300,
			maxColors: 6,
			minLineIn: .02,
			allowsShadow: false,
			allowsGradient: false
		},
		{
			id: "vinyl",
			label: "Heat Vinyl",
			description: "Cut vinyl for names and numbers",
			finish: "glossy",
			artwork: ["text", "vector"],
			minDpi: 0,
			goodDpi: 0,
			maxColors: 3,
			minLineIn: .08,
			minTextHeightIn: .5,
			allowsShadow: false,
			allowsGradient: false
		},
		{
			id: "embroidery",
			label: "Embroidery",
			description: "Stitched thread, premium finish",
			finish: "embroidery",
			artwork: ["text", "vector"],
			minDpi: 0,
			goodDpi: 0,
			maxColors: 12,
			palette: [
				"#ffffff",
				"#111111",
				"#1f2a44",
				"#2250a8",
				"#b3202c",
				"#26452f",
				"#a7a8aa",
				"#e2a927",
				"#5a1f2b",
				"#f08a24",
				"#6d3fa0",
				"#8fc1e3",
				"#f4b6c2",
				"#c9b27c",
				"#3aa655"
			],
			minTextHeightIn: .25,
			minLineIn: .05,
			maxAreaIn: {
				w: 12,
				h: 12
			},
			allowsShadow: false,
			allowsGradient: false
		},
		{
			id: "sublimation",
			label: "Sublimation",
			description: "Edge-to-edge dye print on polyester",
			finish: "dye",
			artwork: [
				"text",
				"raster",
				"vector"
			],
			minDpi: 120,
			goodDpi: 200,
			allOver: true,
			allowsShadow: true,
			allowsGradient: true,
			materials: ["performance", "polyester"]
		}
	],
	cameras: [
		{
			id: "full",
			label: "Full product",
			azimuth: .55,
			polar: 1.38,
			distance: 2.5
		},
		{
			id: "front",
			label: "Front",
			azimuth: 0,
			polar: 1.5,
			distance: 2.3
		},
		{
			id: "back",
			label: "Back",
			azimuth: Math.PI,
			polar: 1.5,
			distance: 2.3
		},
		{
			id: "left",
			label: "Left",
			azimuth: Math.PI / 2,
			polar: 1.5,
			distance: 2.3
		},
		{
			id: "right",
			label: "Right",
			azimuth: -Math.PI / 2,
			polar: 1.5,
			distance: 2.3
		},
		{
			id: "left_sleeve",
			label: "Left sleeve",
			azimuth: 1.15,
			polar: 1.4,
			distance: 1.45,
			focus: "left_sleeve"
		},
		{
			id: "right_sleeve",
			label: "Right sleeve",
			azimuth: -1.15,
			polar: 1.4,
			distance: 1.45,
			focus: "right_sleeve"
		},
		{
			id: "neck",
			label: "Neck",
			azimuth: 0,
			polar: .55,
			distance: 1.25,
			focus: "back_inside"
		},
		{
			id: "detail",
			label: "Detail",
			azimuth: .35,
			polar: 1.4,
			distance: 1.1
		}
	],
	pricing: {
		currency: "USD",
		rules: [
			{
				id: "base-tee",
				label: "Classic T-Shirt",
				amount: 18,
				per: "unit",
				when: { productIds: ["tshirt"] }
			},
			{
				id: "premium-tee",
				label: "Premium fit",
				amount: 4,
				per: "unit",
				when: { modelIds: ["premium-tee"] }
			},
			{
				id: "oversized-tee",
				label: "Oversized fit",
				amount: 3,
				per: "unit",
				when: { modelIds: ["oversized-tee"] }
			},
			{
				id: "base-ls",
				label: "Long Sleeve Tee",
				amount: 22,
				per: "unit",
				when: { productIds: ["longsleeve"] }
			},
			{
				id: "base-polo",
				label: "Piqué Polo",
				amount: 26,
				per: "unit",
				when: { productIds: ["polo"] }
			},
			{
				id: "base-hoodie",
				label: "Pullover Hoodie",
				amount: 38,
				per: "unit",
				when: { productIds: ["hoodie"] }
			},
			{
				id: "base-sweat",
				label: "Crew Sweatshirt",
				amount: 32,
				per: "unit",
				when: { productIds: ["sweatshirt"] }
			},
			{
				id: "base-tank",
				label: "Tank Top",
				amount: 15,
				per: "unit",
				when: { productIds: ["tank"] }
			},
			{
				id: "base-dress",
				label: "Oxford Dress Shirt",
				amount: 42,
				per: "unit",
				when: { productIds: ["dress-shirt"] }
			},
			{
				id: "base-work",
				label: "Workwear Shirt",
				amount: 36,
				per: "unit",
				when: { productIds: ["workwear"] }
			},
			{
				id: "base-jersey",
				label: "Sublimated Jersey",
				amount: 34,
				per: "unit",
				when: { productIds: ["jersey"] }
			},
			{
				id: "base-sports",
				label: "Performance Sports Shirt",
				amount: 20,
				per: "unit",
				when: { productIds: ["sports-tee"] }
			},
			{
				id: "base-kids",
				label: "Kids T-Shirt",
				amount: 14,
				per: "unit",
				when: { productIds: ["kids-tee"] }
			},
			{
				id: "size-2xl",
				label: "2XL size",
				amount: 2,
				per: "unit",
				when: { sizeIds: ["2XL"] }
			},
			{
				id: "size-3xl",
				label: "3XL size",
				amount: 3,
				per: "unit",
				when: { sizeIds: ["3XL"] }
			},
			{
				id: "mat-blend",
				label: "Blend fabric",
				amount: 2,
				per: "unit",
				when: { materialIds: ["blend"] }
			},
			{
				id: "mat-poly",
				label: "Polyester fabric",
				amount: 3,
				per: "unit",
				when: { materialIds: ["polyester"] }
			},
			{
				id: "mat-perf",
				label: "Performance fabric",
				amount: 6,
				per: "unit",
				when: {
					materialIds: ["performance"],
					productIds: [
						"tshirt",
						"tank",
						"polo",
						"sports-tee"
					]
				}
			},
			{
				id: "print-large",
				label: "Large print",
				amount: 5,
				per: "area",
				when: {
					areaGroups: ["large"],
					methodIds: [
						"dtg",
						"dtf",
						"vinyl"
					]
				}
			},
			{
				id: "print-small",
				label: "Small print",
				amount: 3,
				per: "area",
				when: {
					areaGroups: ["small", "label"],
					methodIds: [
						"dtg",
						"dtf",
						"vinyl"
					]
				}
			},
			{
				id: "print-sleeve",
				label: "Sleeve print",
				amount: 3,
				per: "area",
				when: {
					areaGroups: ["sleeve"],
					methodIds: [
						"dtg",
						"dtf",
						"vinyl"
					]
				}
			},
			{
				id: "screen-area",
				label: "Screen print location",
				amount: 2,
				per: "area",
				when: { methodIds: ["screen"] }
			},
			{
				id: "screen-color",
				label: "Screen colour",
				amount: 1,
				per: "color",
				when: { methodIds: ["screen"] }
			},
			{
				id: "screen-setup",
				label: "Screen setup (per order)",
				amount: 25,
				per: "order",
				when: { methodIds: ["screen"] }
			},
			{
				id: "emb-large",
				label: "Large embroidery",
				amount: 14,
				per: "area",
				when: {
					areaGroups: ["large"],
					methodIds: ["embroidery"]
				}
			},
			{
				id: "emb-small",
				label: "Embroidery",
				amount: 8,
				per: "area",
				when: {
					areaGroups: [
						"small",
						"sleeve",
						"label"
					],
					methodIds: ["embroidery"]
				}
			},
			{
				id: "sublimation",
				label: "All-over panel",
				amount: 6,
				per: "area",
				when: { methodIds: ["sublimation"] }
			},
			{
				id: "personal",
				label: "Name / number personalisation",
				amount: 3,
				per: "personalizedUnit"
			},
			{
				id: "premium-art",
				label: "Premium artwork",
				amount: 2,
				per: "premiumAsset"
			}
		],
		tiers: [
			{
				minQty: 1,
				pctOff: 0,
				label: "1–9"
			},
			{
				minQty: 10,
				pctOff: 5,
				label: "10–24"
			},
			{
				minQty: 25,
				pctOff: 10,
				label: "25–49"
			},
			{
				minQty: 50,
				pctOff: 15,
				label: "50–99"
			},
			{
				minQty: 100,
				pctOff: 20,
				label: "100+"
			}
		]
	},
	validation: {
		outOfBounds: "block",
		lowDpi: "warn",
		exclusion: "block",
		methodLimits: "block"
	},
	templates: [
		{
			id: "football-jersey",
			title: "Football Jersey",
			description: "Team crest, player name and number.",
			productId: "jersey",
			areas: {
				back_allover: [{
					kind: "text",
					name: "Player name",
					text: "SMITH",
					fontFamily: "Graduate",
					fontSize: 1.6,
					fill: "#1f2a44",
					x: .5,
					y: .2,
					lock: "editable",
					required: true,
					bulkField: "name"
				}, {
					kind: "text",
					name: "Player number",
					text: "24",
					fontFamily: "Graduate",
					fontSize: 8,
					fill: "#1f2a44",
					x: .5,
					y: .45,
					lock: "editable",
					required: true,
					bulkField: "number"
				}],
				front_allover: [{
					kind: "clipart",
					name: "Club crest",
					clipartId: "shield",
					fill: "#1f2a44",
					x: .66,
					y: .24,
					widthFrac: .16,
					lock: "locked"
				}, {
					kind: "text",
					name: "Front number",
					text: "24",
					fontFamily: "Graduate",
					fontSize: 3.2,
					fill: "#1f2a44",
					x: .34,
					y: .3,
					lock: "editable",
					bulkField: "number"
				}]
			},
			restrictFonts: [
				"Graduate",
				"Oswald",
				"Teko",
				"Bebas Neue"
			]
		},
		{
			id: "company-uniform",
			title: "Company Uniform",
			description: "Locked logo on chest, editable staff name.",
			productId: "polo",
			colors: {
				body: "navy",
				collar: "navy",
				sleeves: "navy"
			},
			methodId: "embroidery",
			areas: {
				left_chest: [{
					kind: "clipart",
					name: "Company logo",
					clipartId: "hexagon-logo",
					fill: "#ffffff",
					x: .5,
					y: .5,
					widthFrac: .7,
					lock: "locked"
				}],
				right_chest: [{
					kind: "text",
					name: "Staff name",
					text: "Alex",
					fontFamily: "Montserrat",
					fontSize: .55,
					fill: "#ffffff",
					x: .5,
					y: .5,
					lock: "editable",
					required: true,
					bulkField: "name"
				}]
			},
			restrictColors: ["#ffffff", "#e2a927"]
		},
		{
			id: "birthday",
			title: "Birthday Shirt",
			description: "Big playful birthday message.",
			productId: "tshirt",
			colors: { body: "white" },
			areas: { full_front: [{
				kind: "clipart",
				name: "Party star",
				clipartId: "star",
				fill: "#e2a927",
				x: .5,
				y: .25,
				widthFrac: .3,
				lock: "editable"
			}, {
				kind: "text",
				name: "Headline",
				text: "BIRTHDAY\nCREW",
				fontFamily: "Bungee",
				fontSize: 1.8,
				fill: "#b3202c",
				x: .5,
				y: .62,
				lock: "editable",
				required: true
			}] }
		},
		{
			id: "staff",
			title: "Staff Shirt",
			description: "STAFF on the back, name on chest.",
			productId: "tshirt",
			colors: { body: "black" },
			areas: {
				full_back: [{
					kind: "text",
					name: "Staff label",
					text: "STAFF",
					fontFamily: "Anton",
					fontSize: 3.4,
					fill: "#ffffff",
					x: .5,
					y: .2,
					lock: "locked"
				}],
				left_chest: [{
					kind: "text",
					name: "Name",
					text: "Your Name",
					fontFamily: "Inter",
					fontSize: .6,
					fill: "#ffffff",
					x: .5,
					y: .5,
					lock: "editable",
					required: true,
					bulkField: "name"
				}]
			}
		},
		{
			id: "school-event",
			title: "School Event",
			description: "Event name and year.",
			productId: "tshirt",
			colors: { body: "royal" },
			areas: { full_front: [
				{
					kind: "clipart",
					name: "Graduation cap",
					clipartId: "grad-cap",
					fill: "#ffffff",
					x: .5,
					y: .22,
					widthFrac: .35,
					lock: "editable"
				},
				{
					kind: "text",
					name: "Event",
					text: "FIELD DAY",
					fontFamily: "Staatliches",
					fontSize: 2,
					fill: "#ffffff",
					x: .5,
					y: .55,
					lock: "editable",
					required: true
				},
				{
					kind: "text",
					name: "Year",
					text: "2026",
					fontFamily: "Staatliches",
					fontSize: 1.2,
					fill: "#e2a927",
					x: .5,
					y: .72,
					lock: "editable"
				}
			] }
		},
		{
			id: "restaurant",
			title: "Restaurant Uniform",
			description: "Kitchen crew workwear.",
			productId: "workwear",
			colors: { body: "black" },
			methodId: "embroidery",
			areas: {
				left_chest: [{
					kind: "clipart",
					name: "Restaurant mark",
					clipartId: "chef-hat",
					fill: "#ffffff",
					x: .5,
					y: .4,
					widthFrac: .55,
					lock: "locked"
				}],
				right_chest: [{
					kind: "text",
					name: "Crew name",
					text: "Chef Sam",
					fontFamily: "Lora",
					fontSize: .5,
					fill: "#ffffff",
					x: .5,
					y: .5,
					lock: "editable",
					required: true,
					bulkField: "name"
				}]
			}
		}
	]
};
//#endregion
//#region src/assets/sniff.ts
function sniff(bytes) {
	const b = bytes;
	const at = (i, ...v) => v.every((x, j) => b[i + j] === x);
	if (at(0, 137, 80, 78, 71, 13, 10, 26, 10)) return "image/png";
	if (at(0, 255, 216, 255)) return "image/jpeg";
	if (at(0, 82, 73, 70, 70) && at(8, 87, 69, 66, 80)) return "image/webp";
	if (at(0, 37, 80, 68, 70)) return "application/pdf";
	const head = new TextDecoder("utf-8", { fatal: false }).decode(b.subarray(0, 1024)).replace(/^﻿/, "").trimStart();
	if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/i.test(head)) return "image/svg+xml";
	return null;
}
//#endregion
export { DesignLoadError, blocking, computePrice, defaultCatalog, deserializeDesign, needsApproval, priceInput, resolve, sniff, totalQty, validateDesign };
