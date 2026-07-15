"use client";

import { useMemo, useState } from "react";
import {
  KEY_STAT_UNITS,
  PROPERTY_TYPES,
  RELEASE_TYPES,
  RELEASE_TYPE_LABELS,
  type UserBrief,
} from "@/lib/schema";

type ReleaseType = (typeof RELEASE_TYPES)[number];
type PropertyType = (typeof PROPERTY_TYPES)[number];
type KeyStatUnit = (typeof KEY_STAT_UNITS)[number];

type GenerateResponse = {
  draft_text: string;
  draft_html: string;
  image_placement_note: string;
  warnings: string[];
  brief: UserBrief;
};

// Anything the form binds — kept string-friendly so inputs stay controlled.
type FormState = {
  release_type: ReleaseType;
  property_name: string;
  property_address: string;
  city: string;
  state: string;
  property_type: PropertyType;
  key_stat_value: string;
  key_stat_unit: KeyStatUnit;
  year_built: string;
  distinguishing_fact: string;
  asking_price: string;
  price_visible_in_release: boolean;
  buyer_name: string;
  seller_name: string;
  closing_date: string;
  broker_name: string;
  broker_title: string;
  firm_name: string;
  firm_boilerplate: string;
  media_contact_name: string;
  media_contact_email: string;
  media_contact_phone: string;
  draft_quote: string;
  quote_angle_hint: string;
  secondary_quote_name: string;
  secondary_quote_title: string;
  secondary_quote_affiliation: string;
  secondary_quote_text: string;
  secondary_quote_angle_hint: string;
  image_credit: string;
};

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC",
];

const DEFAULT_UNIT: Record<PropertyType, KeyStatUnit> = {
  office: "square feet",
  multifamily: "units",
  industrial: "square feet",
  retail: "square feet",
  "mixed-use": "square feet",
  hospitality: "keys",
  land: "acres",
};

const INITIAL: FormState = {
  release_type: "just-listed",
  property_name: "",
  property_address: "",
  city: "",
  state: "",
  property_type: "multifamily",
  key_stat_value: "",
  key_stat_unit: "units",
  year_built: "",
  distinguishing_fact: "",
  asking_price: "",
  price_visible_in_release: false,
  buyer_name: "",
  seller_name: "",
  closing_date: "",
  broker_name: "",
  broker_title: "",
  firm_name: "",
  firm_boilerplate: "",
  media_contact_name: "",
  media_contact_email: "",
  media_contact_phone: "",
  draft_quote: "",
  quote_angle_hint: "",
  secondary_quote_name: "",
  secondary_quote_title: "",
  secondary_quote_affiliation: "",
  secondary_quote_text: "",
  secondary_quote_angle_hint: "",
  image_credit: "",
};

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export default function Generator() {
  const [state, setState] = useState<FormState>(INITIAL);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageOrientation, setImageOrientation] = useState<"landscape" | "portrait">("landscape");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [showEmail, setShowEmail] = useState(false);
  const [emailForm, setEmailForm] = useState({
    first_name: "",
    last_name: "",
    company: "",
    title: "",
    email: "",
    phone: "",
    subscribe_northstar: false,
  });
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailSent, setEmailSent] = useState<string | null>(null);

  const isComingSoon = state.release_type === "coming-soon";
  const isJustListed = state.release_type === "just-listed";
  const isJustSold = state.release_type === "just-sold";

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setState((s) => ({ ...s, [k]: v }));
    setErrors((e) => {
      if (!(k in e)) return e;
      const next = { ...e };
      delete next[k as string];
      return next;
    });
  };

  const onPropertyTypeChange = (v: PropertyType) => {
    set("property_type", v);
    // Pre-select the most likely unit
    setState((s) => ({ ...s, property_type: v, key_stat_unit: DEFAULT_UNIT[v] }));
  };

  const onImagePick = async (file: File | null) => {
    setImageFile(file);
    if (!file) return;
    // Detect orientation client-side
    try {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        setImageOrientation(img.naturalWidth >= img.naturalHeight ? "landscape" : "portrait");
        URL.revokeObjectURL(url);
      };
      img.onerror = () => URL.revokeObjectURL(url);
      img.src = url;
    } catch {
      // Fall back to landscape
    }
  };

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!state.property_address.trim()) e.property_address = "Required.";
    if (!state.city.trim()) e.city = "Required.";
    if (!state.state.trim()) e.state = "Required.";
    if (!state.key_stat_value.trim() || Number(state.key_stat_value) <= 0) {
      e.key_stat_value = "Enter a positive number.";
    }
    if (!state.broker_name.trim()) e.broker_name = "Required.";
    if (!state.broker_title.trim()) e.broker_title = "Required.";
    if (!state.firm_name.trim()) e.firm_name = "Required.";
    if (isComingSoon && !state.distinguishing_fact.trim()) {
      e.distinguishing_fact = "Required for Coming Soon.";
    }
    if (isJustSold && !state.asking_price.trim()) {
      e.asking_price = "Sale price is required for Just Sold.";
    }
    if (state.media_contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.media_contact_email)) {
      e.media_contact_email = "Invalid email address.";
    }
    if (imageFile && imageFile.size > 10 * 1024 * 1024) {
      e.image = "Image must be under 10 MB.";
    }
    const anySecondary =
      state.secondary_quote_title.trim() ||
      state.secondary_quote_affiliation.trim() ||
      state.secondary_quote_text.trim() ||
      state.secondary_quote_angle_hint.trim();
    if (anySecondary && !state.secondary_quote_name.trim()) {
      e.secondary_quote_name =
        "Add the name of the person being quoted, or clear the other second-quote fields.";
    }
    if (state.secondary_quote_name.trim() && !state.secondary_quote_title.trim()) {
      e.secondary_quote_title =
        "Add their title (e.g. 'Managing Partner', 'Seller').";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const buildBrief = (): Record<string, unknown> => {
    const brief: Record<string, unknown> = {
      release_type: state.release_type,
      property_name: state.property_name.trim() || undefined,
      property_address: state.property_address.trim(),
      city: state.city.trim(),
      state: state.state.trim().toUpperCase(),
      property_type: state.property_type,
      key_stat_value: Number(state.key_stat_value),
      key_stat_unit: state.key_stat_unit,
      year_built: state.year_built ? Number(state.year_built) : undefined,
      distinguishing_fact: state.distinguishing_fact.trim() || undefined,
      broker_name: state.broker_name.trim(),
      broker_title: state.broker_title.trim(),
      firm_name: state.firm_name.trim(),
      firm_boilerplate: state.firm_boilerplate.trim() || undefined,
      media_contact_name: state.media_contact_name.trim() || undefined,
      media_contact_email: state.media_contact_email.trim() || undefined,
      media_contact_phone: state.media_contact_phone.trim() || undefined,
      draft_quote: state.draft_quote.trim() || undefined,
      quote_angle_hint: state.quote_angle_hint.trim() || undefined,
      secondary_quote_name: state.secondary_quote_name.trim() || undefined,
      secondary_quote_title: state.secondary_quote_title.trim() || undefined,
      secondary_quote_affiliation: state.secondary_quote_affiliation.trim() || undefined,
      secondary_quote_text: state.secondary_quote_text.trim() || undefined,
      secondary_quote_angle_hint: state.secondary_quote_angle_hint.trim() || undefined,
      image_credit: state.image_credit.trim() || undefined,
      has_image: !!imageFile,
      image_orientation: imageFile ? imageOrientation : undefined,
    };
    if (isComingSoon) {
      brief.price_visible_in_release = state.price_visible_in_release;
      if (state.price_visible_in_release && state.asking_price) {
        brief.asking_price = Number(state.asking_price);
      }
    } else if (isJustListed) {
      if (state.asking_price) brief.asking_price = Number(state.asking_price);
    } else {
      brief.asking_price = Number(state.asking_price);
      brief.buyer_name = state.buyer_name.trim() || undefined;
      brief.seller_name = state.seller_name.trim() || undefined;
      brief.closing_date = state.closing_date || undefined;
    }
    return brief;
  };

  const onGenerate = async () => {
    setFlash(null);
    setEmailSent(null);
    if (!validate()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(buildBrief()),
      });
      // Server might return non-JSON (e.g. an HTML 500 from Next.js) — read
      // as text first so we can surface something useful instead of "Network
      // error" swallowing every failure.
      const raw = await res.text();
      let json: { message?: string; error?: string } = {};
      try { json = raw ? JSON.parse(raw) : {}; } catch { /* not JSON */ }
      if (!res.ok) {
        const msg =
          json.message ||
          (raw && raw.length < 400 ? raw : null) ||
          `Request failed (HTTP ${res.status}). Check the dev server logs.`;
        setFlash(msg);
        setResult(null);
      } else {
        setResult(json as unknown as GenerateResponse);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setFlash(`Could not reach the server: ${msg}`);
    } finally {
      setBusy(false);
    }
  };

  const slug = useMemo(() => {
    if (!result) return "";
    const b = result.brief;
    return slugify(b.property_name || b.property_address || "cre-press-release");
  }, [result]);

  const download = async (format: "docx" | "pdf") => {
    if (!result) return;
    const fd = new FormData();
    fd.set("draft_text", result.draft_text);
    fd.set("format", format);
    fd.set("slug", slug);
    fd.set("image_orientation", imageOrientation);
    if (state.image_credit.trim()) fd.set("image_credit", state.image_credit.trim());
    if (imageFile) fd.set("image", imageFile);
    const res = await fetch("/api/render", { method: "POST", body: fd });
    if (!res.ok) {
      setFlash("Download failed. Please try again.");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cre-press-release-${slug}.${format}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const copyText = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result.draft_text);
    setFlash("Copied to clipboard.");
    setTimeout(() => setFlash(null), 2500);
  };

  const sendEmail = async () => {
    if (!result) return;
    if (!emailForm.first_name.trim() || !emailForm.last_name.trim()) {
      setFlash("Enter your first and last name.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailForm.email)) {
      setFlash("Enter a valid email address.");
      return;
    }
    setEmailBusy(true);
    try {
      const fd = new FormData();
      fd.set(
        "payload",
        JSON.stringify({
          first_name: emailForm.first_name.trim(),
          last_name: emailForm.last_name.trim(),
          company: emailForm.company.trim(),
          title: emailForm.title.trim(),
          email: emailForm.email.trim(),
          phone: emailForm.phone.trim(),
          subscribe_northstar: emailForm.subscribe_northstar,
          draft_text: result.draft_text,
          brief: result.brief,
          slug,
        }),
      );
      if (imageFile) fd.set("image", imageFile);
      const res = await fetch("/api/send-email", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) {
        setFlash(json.message || "Email failed. Please try again.");
      } else {
        setEmailSent(emailForm.email);
        setShowEmail(false);
      }
    } finally {
      setEmailBusy(false);
    }
  };

  return (
    <div className="layout">
      <section className="form-panel">
        <h2>Your deal</h2>
        <p className="section-note">
          Fill in the basics. You&apos;ll get a draft in about a minute.
        </p>

        <fieldset>
          <legend>Release type</legend>
          <div className="radio-group">
            {RELEASE_TYPES.map((rt) => (
              <label key={rt}>
                <input
                  type="radio"
                  name="release_type"
                  value={rt}
                  checked={state.release_type === rt}
                  onChange={() => set("release_type", rt)}
                />
                {RELEASE_TYPE_LABELS[rt]}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend>The property</legend>
          <div className="field">
            <label>Property name (optional)</label>
            <input
              type="text"
              value={state.property_name}
              maxLength={80}
              onChange={(e) => set("property_name", e.target.value)}
              placeholder='e.g. "The Brigantine"'
            />
          </div>
          <div className="field">
            <label>Street address</label>
            <input
              type="text"
              value={state.property_address}
              onChange={(e) => set("property_address", e.target.value)}
            />
            {errors.property_address && <div className="error">{errors.property_address}</div>}
          </div>
          <div className="row-3">
            <div className="field">
              <label>City</label>
              <input
                type="text"
                value={state.city}
                onChange={(e) => set("city", e.target.value)}
              />
              {errors.city && <div className="error">{errors.city}</div>}
            </div>
            <div className="field">
              <label>State</label>
              <select value={state.state} onChange={(e) => set("state", e.target.value)}>
                <option value="">—</option>
                {US_STATES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              {errors.state && <div className="error">{errors.state}</div>}
            </div>
            <div className="field">
              <label>Year built (optional)</label>
              <input
                type="number"
                value={state.year_built}
                onChange={(e) => set("year_built", e.target.value)}
                min={1700}
                max={new Date().getFullYear() + 5}
              />
            </div>
          </div>
          <div className="row-2">
            <div className="field">
              <label>Property type</label>
              <select
                value={state.property_type}
                onChange={(e) => onPropertyTypeChange(e.target.value as PropertyType)}
              >
                {PROPERTY_TYPES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Key stat</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="number"
                  value={state.key_stat_value}
                  onChange={(e) => set("key_stat_value", e.target.value)}
                  min={1}
                  placeholder="e.g. 48"
                  style={{ flex: 1 }}
                />
                <select
                  value={state.key_stat_unit}
                  onChange={(e) => set("key_stat_unit", e.target.value as KeyStatUnit)}
                  style={{ flex: 1 }}
                >
                  {KEY_STAT_UNITS.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>
              {errors.key_stat_value && <div className="error">{errors.key_stat_value}</div>}
            </div>
          </div>
          <div className="field">
            <label>
              Distinguishing fact / hook{isComingSoon ? " (required)" : " (optional)"}
            </label>
            <textarea
              value={state.distinguishing_fact}
              onChange={(e) => set("distinguishing_fact", e.target.value)}
              maxLength={300}
              placeholder="One sentence answering: why is this news?"
            />
            {errors.distinguishing_fact && (
              <div className="error">{errors.distinguishing_fact}</div>
            )}
          </div>
        </fieldset>

        <fieldset>
          <legend>Price & transaction</legend>
          {!isComingSoon && (
            <div className="field">
              <label>{isJustSold ? "Sale price" : "Asking price (optional)"}</label>
              <input
                type="number"
                value={state.asking_price}
                onChange={(e) => set("asking_price", e.target.value)}
                min={1}
                placeholder="e.g. 10900000"
              />
              {errors.asking_price && <div className="error">{errors.asking_price}</div>}
            </div>
          )}
          {isComingSoon && (
            <>
              <div className="field">
                <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={state.price_visible_in_release}
                    onChange={(e) => set("price_visible_in_release", e.target.checked)}
                  />
                  Show a price in this release
                </label>
                <div className="hint">
                  Default off. If off, the release reads &quot;pricing guidance available upon
                  qualification.&quot;
                </div>
              </div>
              {state.price_visible_in_release && (
                <div className="field">
                  <label>Asking price</label>
                  <input
                    type="number"
                    value={state.asking_price}
                    onChange={(e) => set("asking_price", e.target.value)}
                    min={1}
                  />
                </div>
              )}
            </>
          )}
          {isJustSold && (
            <>
              <div className="row-2">
                <div className="field">
                  <label>Buyer (optional)</label>
                  <input
                    type="text"
                    value={state.buyer_name}
                    onChange={(e) => set("buyer_name", e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Seller (optional)</label>
                  <input
                    type="text"
                    value={state.seller_name}
                    onChange={(e) => set("seller_name", e.target.value)}
                  />
                </div>
              </div>
              <div className="field">
                <label>Closing date (optional)</label>
                <input
                  type="date"
                  value={state.closing_date}
                  onChange={(e) => set("closing_date", e.target.value)}
                />
              </div>
            </>
          )}
        </fieldset>

        <fieldset>
          <legend>Broker & firm</legend>
          <div className="row-2">
            <div className="field">
              <label>Broker name</label>
              <input
                type="text"
                value={state.broker_name}
                onChange={(e) => set("broker_name", e.target.value)}
              />
              {errors.broker_name && <div className="error">{errors.broker_name}</div>}
            </div>
            <div className="field">
              <label>Broker title</label>
              <input
                type="text"
                value={state.broker_title}
                onChange={(e) => set("broker_title", e.target.value)}
                placeholder="e.g. Senior Managing Director"
              />
              {errors.broker_title && <div className="error">{errors.broker_title}</div>}
            </div>
          </div>
          <div className="field">
            <label>Firm name</label>
            <input
              type="text"
              value={state.firm_name}
              onChange={(e) => set("firm_name", e.target.value)}
            />
            {errors.firm_name && <div className="error">{errors.firm_name}</div>}
          </div>
          <div className="field">
            <label>Firm boilerplate (optional)</label>
            <textarea
              value={state.firm_boilerplate}
              onChange={(e) => set("firm_boilerplate", e.target.value)}
              maxLength={800}
              placeholder="2–4 sentences. If blank, we'll leave a [FIRM BOILERPLATE] slot."
            />
          </div>
          <div className="row-3">
            <div className="field">
              <label>Media contact name (optional)</label>
              <input
                type="text"
                value={state.media_contact_name}
                onChange={(e) => set("media_contact_name", e.target.value)}
              />
            </div>
            <div className="field">
              <label>Email (optional)</label>
              <input
                type="email"
                value={state.media_contact_email}
                onChange={(e) => set("media_contact_email", e.target.value)}
              />
              {errors.media_contact_email && (
                <div className="error">{errors.media_contact_email}</div>
              )}
            </div>
            <div className="field">
              <label>Phone (optional)</label>
              <input
                type="tel"
                value={state.media_contact_phone}
                onChange={(e) => set("media_contact_phone", e.target.value)}
              />
            </div>
          </div>
        </fieldset>

        <fieldset>
          <legend>Voice (optional)</legend>
          <div className="field">
            <label>Draft quote from the broker</label>
            <textarea
              value={state.draft_quote}
              onChange={(e) => set("draft_quote", e.target.value)}
              maxLength={600}
              placeholder="If blank, we'll generate a [DRAFT QUOTE — approve or edit]."
            />
          </div>
          <div className="field">
            <label>Quote angle hint</label>
            <input
              type="text"
              value={state.quote_angle_hint}
              onChange={(e) => set("quote_angle_hint", e.target.value)}
              placeholder='e.g. "emphasize the 1031 exchange window"'
            />
          </div>
        </fieldset>

        <fieldset>
          <legend>Second quote (optional)</legend>
          <p className="section-note" style={{ margin: "-4px 0 12px" }}>
            Add a second voice — seller, developer, city official, partner
            firm broker, debt/equity partner. Leave blank to skip.
          </p>
          <div className="row-2">
            <div className="field">
              <label>Their name</label>
              <input
                type="text"
                value={state.secondary_quote_name}
                onChange={(e) => set("secondary_quote_name", e.target.value)}
                placeholder="e.g. John Smith"
                maxLength={120}
              />
              {errors.secondary_quote_name && (
                <div className="error">{errors.secondary_quote_name}</div>
              )}
            </div>
            <div className="field">
              <label>Their title</label>
              <input
                type="text"
                value={state.secondary_quote_title}
                onChange={(e) => set("secondary_quote_title", e.target.value)}
                placeholder='e.g. "Managing Partner" or "Seller"'
                maxLength={120}
              />
              {errors.secondary_quote_title && (
                <div className="error">{errors.secondary_quote_title}</div>
              )}
            </div>
          </div>
          <div className="field">
            <label>Their firm / affiliation (optional)</label>
            <input
              type="text"
              value={state.secondary_quote_affiliation}
              onChange={(e) => set("secondary_quote_affiliation", e.target.value)}
              placeholder='e.g. "Acme Development"'
              maxLength={200}
            />
            <div className="hint">
              Only include if different from the listing firm. Attribution
              reads: <em>&quot;…,&quot; said Title, Name, of Affiliation.</em>
            </div>
          </div>
          <div className="field">
            <label>Their draft quote (optional)</label>
            <textarea
              value={state.secondary_quote_text}
              onChange={(e) => set("secondary_quote_text", e.target.value)}
              maxLength={600}
              placeholder="If blank, we'll generate a [DRAFT QUOTE — approve or edit] in their voice."
            />
          </div>
          <div className="field">
            <label>Angle hint for their quote</label>
            <input
              type="text"
              value={state.secondary_quote_angle_hint}
              onChange={(e) => set("secondary_quote_angle_hint", e.target.value)}
              placeholder='e.g. "excited about the sale price" or "welcoming the buyer to the market"'
            />
          </div>
        </fieldset>

        <fieldset>
          <legend>Image (optional)</legend>
          <div className="field">
            <label>Property image (JPEG or PNG, ≤10 MB)</label>
            <input
              type="file"
              accept="image/jpeg,image/png"
              onChange={(e) => onImagePick(e.target.files?.[0] || null)}
            />
            {errors.image && <div className="error">{errors.image}</div>}
            {imageFile && (
              <div className="hint">
                {imageFile.name} · detected: {imageOrientation}
              </div>
            )}
          </div>
          {imageFile && (
            <div className="field">
              <label>Photo credit (optional)</label>
              <input
                type="text"
                value={state.image_credit}
                onChange={(e) => set("image_credit", e.target.value)}
              />
            </div>
          )}
          <div className="privacy">
            Your image and text are used only to generate this draft. We do not
            store them after your session ends. We do not sell your data.
          </div>
        </fieldset>

        <div className="actions">
          <button className="btn" onClick={onGenerate} disabled={busy}>
            {busy ? "Generating…" : "Generate draft"}
          </button>
          {flash && <span style={{ alignSelf: "center", color: "var(--warn)" }}>{flash}</span>}
        </div>
      </section>

      <aside className="preview-panel">
        <h2>Draft preview</h2>
        <p className="section-note">
          Copy, download as .docx / .pdf, or email it to yourself. All four
          actions are available without an email address.
        </p>
        {!result && (
          <div className="preview-placeholder">
            Fill in the form and click <strong>Generate draft</strong>. Your
            draft will appear here.
          </div>
        )}
        {result && (
          <>
            {result.warnings.length > 0 &&
              result.warnings.map((w, i) => (
                <div className="warning" key={i}>{w}</div>
              ))}
            <div className="warning" style={{ background: "var(--accent-soft)", color: "var(--accent)", borderColor: "#cfdaea" }}>
              <strong>Image placement:</strong> {result.image_placement_note}
            </div>
            <div className="preview-box" dangerouslySetInnerHTML={{ __html: result.draft_html }} />
            <div className="actions">
              <button className="btn secondary" onClick={copyText}>Copy text</button>
              <button className="btn secondary" onClick={() => download("docx")}>Download .docx</button>
              <button className="btn secondary" onClick={() => download("pdf")}>Download .pdf</button>
              <button className="btn" onClick={() => setShowEmail((v) => !v)}>
                {showEmail ? "Never mind" : "Email it to me"}
              </button>
            </div>

            {emailSent && (
              <div className="warning" style={{ background: "#eaf6ea", color: "#1e5a2b", borderColor: "#c5e2c5" }}>
                Sent to {emailSent} — check your inbox in a minute.
              </div>
            )}

            {showEmail && (
              <div className="email-card">
                <h3>Send this draft to your inbox</h3>
                <div className="section-note">
                  We&apos;ll email you the .docx and .pdf so you have them for later.
                </div>
                <div className="row-2">
                  <div className="field">
                    <label>First name</label>
                    <input
                      type="text"
                      value={emailForm.first_name}
                      onChange={(e) => setEmailForm((s) => ({ ...s, first_name: e.target.value }))}
                    />
                  </div>
                  <div className="field">
                    <label>Last name</label>
                    <input
                      type="text"
                      value={emailForm.last_name}
                      onChange={(e) => setEmailForm((s) => ({ ...s, last_name: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="row-2">
                  <div className="field">
                    <label>Company</label>
                    <input
                      type="text"
                      value={emailForm.company}
                      onChange={(e) => setEmailForm((s) => ({ ...s, company: e.target.value }))}
                    />
                  </div>
                  <div className="field">
                    <label>Title</label>
                    <input
                      type="text"
                      value={emailForm.title}
                      onChange={(e) => setEmailForm((s) => ({ ...s, title: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="field">
                  <label>Email address</label>
                  <input
                    type="email"
                    value={emailForm.email}
                    onChange={(e) => setEmailForm((s) => ({ ...s, email: e.target.value }))}
                    placeholder="you@brokerage.com"
                  />
                </div>
                <div className="field">
                  <label>Phone</label>
                  <input
                    type="tel"
                    value={emailForm.phone}
                    onChange={(e) => setEmailForm((s) => ({ ...s, phone: e.target.value }))}
                    placeholder="(optional)"
                  />
                </div>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={emailForm.subscribe_northstar}
                    onChange={(e) =>
                      setEmailForm((s) => ({ ...s, subscribe_northstar: e.target.checked }))
                    }
                  />
                  <span>
                    I&apos;d also like occasional updates about CRE Northstar,
                    Julie Chasen&apos;s AI marketing platform for CRE brokers.
                  </span>
                </label>
                <div className="actions">
                  <button className="btn" onClick={sendEmail} disabled={emailBusy}>
                    {emailBusy ? "Sending…" : "Send it"}
                  </button>
                  <button className="btn ghost" onClick={() => setShowEmail(false)}>
                    Never mind
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </aside>
    </div>
  );
}
