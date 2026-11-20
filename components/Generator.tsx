"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  KEY_STAT_UNITS,
  PROPERTY_TYPES,
  PROPERTY_TYPE_LABELS,
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
  draft_signature: string;
  image_placement_note: string;
  warnings: string[];
  brief: UserBrief;
};

// Anything the form binds — kept string-friendly so inputs stay controlled.
type FormState = {
  contact_first_name: string;
  contact_last_name: string;
  contact_title: string;
  contact_company: string;
  contact_email: string;
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
};

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC",
];

const DEFAULT_UNIT: Record<PropertyType, KeyStatUnit> = {
  office: "square feet",
  industrial: "square feet",
  retail: "square feet",
  multifamily: "units",
  hospitality: "keys",
  "mixed-use": "square feet",
  "medical-office": "square feet",
  "senior-housing": "units",
  "student-housing": "units",
  "self-storage": "square feet",
  "data-centers": "square feet",
  "life-sciences": "square feet",
  land: "acres",
  other: "square feet",
};

// A complete sample deal — the same one the scoping mockup shipped with. The
// form opens pre-filled with it so a first-time broker can see what good input
// looks like, and "Clear all fields" empties it. "About you" is excluded: it is
// the lead-capture block and has to be the broker's own details.
const EXAMPLE: Omit<
  FormState,
  "contact_first_name" | "contact_last_name" | "contact_title" | "contact_company" | "contact_email"
> = {
  release_type: "just-listed",
  property_name: "The Brigantine",
  property_address: "2450 Fourth Avenue",
  city: "San Diego",
  state: "CA",
  property_type: "multifamily",
  key_stat_value: "48",
  key_stat_unit: "units",
  year_built: "2019",
  distinguishing_fact:
    "First institutional-quality multifamily asset to hit the Bankers Hill submarket since 2019.",
  asking_price: "10900000",
  price_visible_in_release: true,
  buyer_name: "",
  seller_name: "",
  closing_date: "",
  broker_name: "Jordan Rivera",
  broker_title: "Senior Managing Director",
  firm_name: "Rivera Commercial Advisors",
  firm_boilerplate:
    "Rivera Commercial Advisors is a San Diego-based brokerage focused exclusively on multifamily investment sales across Southern California. The firm has closed more than $2.4 billion in transactions since 2011.",
  media_contact_name: "",
  media_contact_email: "press@riveracommercial.com",
  media_contact_phone: "(619) 555-0142",
  draft_quote: "",
  quote_angle_hint:
    "Emphasize the scarcity of institutional-quality product in Bankers Hill.",
  secondary_quote_name: "",
  secondary_quote_title: "",
  secondary_quote_affiliation: "",
  secondary_quote_text: "",
  secondary_quote_angle_hint: "",
};

const BLANK_DEAL: Omit<
  FormState,
  "contact_first_name" | "contact_last_name" | "contact_title" | "contact_company" | "contact_email"
> = {
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
};

const INITIAL: FormState = {
  contact_first_name: "",
  contact_last_name: "",
  contact_title: "",
  contact_company: "",
  contact_email: "",
  ...EXAMPLE,
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
  const previewRef = useRef<HTMLElement>(null);
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

  // The form opens on the sample deal, so the link empties it; once empty it
  // offers the sample back. Either way "About you" is left alone — that's the
  // lead capture and has to stay the broker's own details.
  const [showingExample, setShowingExample] = useState(true);
  const toggleExample = () => {
    setState((s) => ({ ...s, ...(showingExample ? BLANK_DEAL : EXAMPLE) }));
    setErrors({});
    setShowingExample((v) => !v);
  };

  const onPropertyTypeChange = (v: PropertyType) => {
    set("property_type", v);
    // Pre-select the most likely unit
    setState((s) => ({ ...s, property_type: v, key_stat_unit: DEFAULT_UNIT[v] }));
  };


  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!state.contact_first_name.trim()) e.contact_first_name = "Required.";
    if (!state.contact_last_name.trim()) e.contact_last_name = "Required.";
    if (!state.contact_title.trim()) e.contact_title = "Required.";
    if (!state.contact_company.trim()) e.contact_company = "Required.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.contact_email.trim())) {
      e.contact_email = "Enter a valid email address.";
    }
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
      contact_first_name: state.contact_first_name.trim(),
      contact_last_name: state.contact_last_name.trim(),
      contact_title: state.contact_title.trim(),
      contact_company: state.contact_company.trim(),
      contact_email: state.contact_email.trim(),
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

  // The draft reserves an empty image slot beneath the deck — the same one the
  // .docx gets — so the broker can drop their own photo in afterwards. The LLM
  // is told to emit it, but fall back to inserting one if it forgets.
  const previewHtml = useMemo(() => {
    if (!result) return "";
    if (/<div class="image-slot">\s*<\/div>/i.test(result.draft_html)) {
      return result.draft_html;
    }
    const slot = '<div class="image-slot"></div>';
    const afterH1 = result.draft_html.indexOf("</h1>");
    if (afterH1 !== -1) {
      const cut = afterH1 + "</h1>".length;
      return result.draft_html.slice(0, cut) + slot + result.draft_html.slice(cut);
    }
    return slot + result.draft_html;
  }, [result]);

  // Bring the finished draft into view — on stacked/mobile layouts the
  // preview panel sits below the fold when Generate is clicked.
  useEffect(() => {
    if (result) previewRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [result]);

  const download = async () => {
    if (!result) return;
    const fd = new FormData();
    fd.set("draft_text", result.draft_text);
    fd.set("format", "docx");
    fd.set("slug", slug);
    const res = await fetch("/api/render", { method: "POST", body: fd });
    if (!res.ok) {
      setFlash("Download failed. Please try again.");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cre-press-release-${slug}.docx`;
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
          draft_signature: result.draft_signature,
          brief: result.brief,
          slug,
        }),
      );
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
          The deal fields below are filled in with an example so you can see what
          goes where — type over them with your own.{" "}
          <button type="button" className="link-btn" onClick={toggleExample}>
            {showingExample ? "Clear all fields" : "Put the example back"}
          </button>
          .
        </p>

        <fieldset>
          <legend>About you</legend>
          <p className="section-note" style={{ margin: "-4px 0 12px" }}>
            So we know who the draft is for. This does not appear in the
            release itself.
          </p>
          <div className="row-2">
            <div className="field">
              <label>First name</label>
              <input
                type="text"
                value={state.contact_first_name}
                maxLength={80}
                onChange={(e) => set("contact_first_name", e.target.value)}
                placeholder="e.g. Jordan"
              />
              {errors.contact_first_name && (
                <div className="error">{errors.contact_first_name}</div>
              )}
            </div>
            <div className="field">
              <label>Last name</label>
              <input
                type="text"
                value={state.contact_last_name}
                maxLength={80}
                onChange={(e) => set("contact_last_name", e.target.value)}
                placeholder="e.g. Rivera"
              />
              {errors.contact_last_name && (
                <div className="error">{errors.contact_last_name}</div>
              )}
            </div>
          </div>
          <div className="row-2">
            <div className="field">
              <label>Title</label>
              <input
                type="text"
                value={state.contact_title}
                maxLength={120}
                onChange={(e) => set("contact_title", e.target.value)}
                placeholder="e.g. Senior Vice President"
              />
              {errors.contact_title && (
                <div className="error">{errors.contact_title}</div>
              )}
            </div>
            <div className="field">
              <label>Company</label>
              <input
                type="text"
                value={state.contact_company}
                maxLength={120}
                onChange={(e) => set("contact_company", e.target.value)}
                placeholder="e.g. Rivera Commercial Advisors"
              />
              {errors.contact_company && (
                <div className="error">{errors.contact_company}</div>
              )}
            </div>
          </div>
          <div className="field">
            <label>Work email</label>
            <input
              type="email"
              value={state.contact_email}
              maxLength={200}
              onChange={(e) => set("contact_email", e.target.value)}
              placeholder="you@brokerage.com"
            />
            {errors.contact_email && (
              <div className="error">{errors.contact_email}</div>
            )}
          </div>
        </fieldset>

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
              placeholder="e.g. 123 Ocean Boulevard"
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
                placeholder="e.g. San Diego"
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
                placeholder="e.g. 1998"
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
                  <option key={p} value={p}>{PROPERTY_TYPE_LABELS[p]}</option>
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
              placeholder="e.g. First institutional-quality multifamily asset to hit the Bankers Hill submarket since 2019."
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
                    placeholder="e.g. 10900000"
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
                    placeholder="e.g. Coastal Equity Partners"
                  />
                </div>
                <div className="field">
                  <label>Seller (optional)</label>
                  <input
                    type="text"
                    value={state.seller_name}
                    onChange={(e) => set("seller_name", e.target.value)}
                    placeholder="e.g. Blue Harbor Holdings"
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
                placeholder="e.g. Jordan Rivera"
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
              placeholder="e.g. Rivera Commercial Advisors"
            />
            {errors.firm_name && <div className="error">{errors.firm_name}</div>}
          </div>
          <div className="field">
            <label>Firm boilerplate (optional)</label>
            <textarea
              value={state.firm_boilerplate}
              onChange={(e) => set("firm_boilerplate", e.target.value)}
              maxLength={800}
              placeholder="e.g. Rivera Commercial Advisors is a San Diego-based brokerage focused exclusively on multifamily investment sales across Southern California. The firm has closed more than $2.4 billion in transactions since 2011. — 2–4 sentences. If blank, we'll leave a [FIRM BOILERPLATE] slot."
            />
          </div>
          <div className="row-3">
            <div className="field">
              <label>Media contact name (optional)</label>
              <input
                type="text"
                value={state.media_contact_name}
                onChange={(e) => set("media_contact_name", e.target.value)}
                placeholder="e.g. Jordan Rivera"
              />
            </div>
            <div className="field">
              <label>Email (optional)</label>
              <input
                type="email"
                value={state.media_contact_email}
                onChange={(e) => set("media_contact_email", e.target.value)}
                placeholder="e.g. press@riveracommercial.com"
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
                placeholder="e.g. (619) 555-0142"
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
              placeholder={'e.g. "Assets of this quality rarely trade in Bankers Hill, and we expect strong interest from both regional and institutional buyers." — if blank, we\'ll generate a [DRAFT QUOTE — approve or edit].'}
            />
          </div>
          <div className="field">
            <label>Quote angle hint</label>
            <input
              type="text"
              value={state.quote_angle_hint}
              onChange={(e) => set("quote_angle_hint", e.target.value)}
              placeholder='e.g. "emphasize the scarcity of institutional-quality product in this submarket"'
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

        <div className="privacy">
          Your deal details are used only to generate this draft — we do not keep
          them after your session ends. Your contact info (name, title, company,
          email) is kept so we know who is using the tool. We never sell your
          data.
        </div>

        <div className="actions">
          <button className="btn" onClick={onGenerate} disabled={busy}>
            {busy ? "Generating…" : "Generate draft"}
          </button>
          {flash && <span style={{ alignSelf: "center", color: "var(--warn)" }}>{flash}</span>}
        </div>
      </section>

      <aside className="preview-panel" ref={previewRef}>
        <h2>Draft preview</h2>
        <p className="section-note">
          Copy it, download the .docx, or email it to yourself. All three
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
            <div className="preview-box" dangerouslySetInnerHTML={{ __html: previewHtml }} />
            <div className="actions">
              <button className="btn secondary" onClick={copyText}>Copy text</button>
              <button className="btn secondary" onClick={download}>Download .docx</button>
              <button
                className="btn"
                onClick={() => {
                  // Prefill from About-you so nobody types their info twice.
                  setEmailForm((s) => ({
                    ...s,
                    first_name: s.first_name || state.contact_first_name,
                    last_name: s.last_name || state.contact_last_name,
                    company: s.company || state.contact_company,
                    title: s.title || state.contact_title,
                    email: s.email || state.contact_email,
                  }));
                  setShowEmail((v) => !v);
                }}
              >
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
                  We&apos;ll email you the .docx so you have it for later.
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
