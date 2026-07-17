# Schema — DRAFT (for review, not finalized)

This document sketches the two record types the sync layer stores. It is a
**starting point for human review**, not a finalized contract. Field names,
required/optional status, and the exact `$extensions` shape are all open for
discussion. Nothing downstream should treat this as frozen yet.

Base format is the [W3C Design Tokens Community Group (DTCG)][dtcg] draft
format for tokens. Components are not a DTCG concept, so that shape is our own.

[dtcg]: https://www.designtokens.org/tr/drafts/format/

Open questions are collected at the bottom.

---

## 1. Token record

A token record is a standard DTCG token object — `$value`, `$type`,
`$description` — extended with a vendor block under
`$extensions.com.iqm.figma` carrying the Figma-specific metadata the DTCG
format doesn't model.

### Shape

| Field | Type | Notes |
|-------|------|-------|
| `$value` | any | DTCG value. Either a concrete value (e.g. `"#0B63F6"`, `2`) or an alias reference `"{group.token}"`. |
| `$type` | string | DTCG type: `color`, `dimension`, `fontFamily`, `fontWeight`, `duration`, `number`, `borderWidth`, etc. |
| `$description` | string | Human description. In practice sourced from the Figma variable's description field. |
| `$extensions.com.iqm.figma.nodeId` | string | Figma variable id (e.g. `VariableID:1:23`). |
| `$extensions.com.iqm.figma.layer` | enum | One of `Primitive`, `Global Alias`, `System Alias`, `Component`. Matches the IQM four-layer token architecture. |
| `$extensions.com.iqm.figma.collectionName` | string | The Figma variable collection this token belongs to (e.g. `Primitive`, `Global`, `System`, `Component`). |
| `$extensions.com.iqm.figma.mode` | string | The mode this value was resolved in (e.g. `Light`, `Dark`, `Default`). A token may have one record per mode. |
| `$extensions.com.iqm.figma.c1BypassChecked` | boolean | Whether this token was verified to not bypass the C1 layer (i.e. Component tokens should route through System/Global Alias, never straight to Primitive). `true` = checked & compliant. |

> **Note on modes:** DTCG doesn't natively express Figma multi-mode variables.
> The draft assumption here is **one record per (token, mode)** pair, with the
> mode captured in the extension block. An alternative — a single record whose
> `$value` is a map keyed by mode — is listed as an open question below.

### Examples

#### 1a. A Primitive color token

```json
{
  "$value": "#0B63F6",
  "$type": "color",
  "$description": "IQM theme blue, 500 step. Raw palette value.",
  "$extensions": {
    "com.iqm.figma": {
      "nodeId": "VariableID:12:104",
      "layer": "Primitive",
      "collectionName": "Primitive",
      "mode": "Default",
      "c1BypassChecked": true
    }
  }
}
```

#### 1b. A System Alias border / focus-ring token (aliases upward, not to a primitive)

```json
{
  "$value": "{global.color.border.focus}",
  "$type": "color",
  "$description": "Focus ring color applied to interactive elements on keyboard focus.",
  "$extensions": {
    "com.iqm.figma": {
      "nodeId": "VariableID:31:562",
      "layer": "System Alias",
      "collectionName": "System",
      "mode": "Light",
      "c1BypassChecked": true
    }
  }
}
```

#### 1c. A Component token bound to the Button (routes through System Alias — C1 respected)

```json
{
  "$value": "{system.color.action.primary.bg}",
  "$type": "color",
  "$description": "Background fill for the primary (Filled) Button in its default state.",
  "$extensions": {
    "com.iqm.figma": {
      "nodeId": "VariableID:47:881",
      "layer": "Component",
      "collectionName": "Component",
      "mode": "Default",
      "c1BypassChecked": true
    }
  }
}
```

---

## 2. Component record

Components aren't a DTCG concept, so this is a bespoke shape. It captures what
we need to track a component across the ship pipeline and surface its native
Figma description to downstream docs/AI tooling.

### Shape

| Field | Type | Notes |
|-------|------|-------|
| `componentId` | string | Figma node id of the component (or component set), e.g. `374:5677`. |
| `name` | string | Component name as it appears in Figma. |
| `page` | string | The Figma page the component lives on (e.g. `❖ Button`). |
| `description` | string | Pulled from Figma's **native** `.description` field on the component node — the same text an MCP/AI tool reads. |
| `variantProperties` | object | Map of variant property → array of possible values. Empty `{}` for non-variant components. |
| `lastModified` | string | ISO 8601 timestamp of the component's last edit (from Figma). |
| `status` | enum | Ship-pipeline stage: `WIP`, `Shipped`, or `Deprecated`. |

### Examples

#### 2a. Button — a shipped component set with variants

```json
{
  "componentId": "374:5601",
  "name": "Button",
  "page": "❖ Button",
  "description": "Primary interactive control. Composed of an optional leading icon, a label, and an optional trailing icon inside a token-bound container. Use for the main action in a view; prefer a single Filled Button per section.",
  "variantProperties": {
    "Variant": ["Filled", "Outlined", "Text", "Icon"],
    "Size": ["Small", "Medium", "Large"],
    "State": ["Default", "Hover", "Pressed", "Focus", "Disabled"]
  },
  "lastModified": "2026-07-14T09:32:00Z",
  "status": "Shipped"
}
```

#### 2b. Checkbox — mid-migration, still WIP

```json
{
  "componentId": "512:2043",
  "name": "Checkbox",
  "page": "🚧 Triage",
  "description": "Binary selection control with checked, unchecked, and indeterminate states. Token migration in progress — some fills still bound to Global Alias directly.",
  "variantProperties": {
    "State": ["Unchecked", "Checked", "Indeterminate"],
    "Interaction": ["Default", "Hover", "Focus", "Disabled"]
  },
  "lastModified": "2026-07-16T15:10:00Z",
  "status": "WIP"
}
```

#### 2c. Legacy Dropdown — deprecated in favor of Input-Select

```json
{
  "componentId": "201:770",
  "name": "Dropdown (legacy)",
  "page": "🗄 Archive",
  "description": "Deprecated. Superseded by Input-Select. Retained for reference during migration of older campaign-setup screens; do not use in new work.",
  "variantProperties": {},
  "lastModified": "2026-05-02T11:45:00Z",
  "status": "Deprecated"
}
```

---

## Open questions (for review)

1. **Modes:** one record per `(token, mode)` pair (current draft), or one
   record whose `$value` is a mode-keyed map? The per-mode approach is simpler
   to diff; the map approach is closer to how Figma models it.
2. **Aliases & diffing:** should we store the *resolved* concrete value
   alongside the `{alias.reference}` so diffs can catch "primitive changed
   under a stable alias" cases? Possibly a second `$extensions` field.
3. **`c1BypassChecked` provenance:** boolean is minimal. Do we also want to
   record *when* / *by what* it was checked (plugin run id, timestamp)?
4. **Component ↔ token linkage:** should a component record carry the list of
   Component-layer token ids it consumes, to power "what breaks if this token
   changes" queries in the diff phase?
5. **Record identity / keys:** what's the stable primary key in Firestore —
   `nodeId` alone, or `nodeId + mode` for tokens? `componentId` for components?
6. **Deprecated tokens:** components have a `Deprecated` status; tokens don't
   yet. Do tokens need an equivalent lifecycle field?
