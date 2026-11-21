// Fenêtre de saisie générique : formDialog(titre, champs, valeurs) -> Promise<valeurs | null>
//
// Champ : { key, label, type, options, placeholder, unit, full, rows, required, datalist, help }
// Types : text, number, date, datetime, select, textarea, rating (1 à 5), tel, email
import { h, icon, openOverlay, toast } from './ui.js';

let dlCounter = 0;

function input(f, value) {
  const id = 'dlg-' + f.key;
  switch (f.type) {
    case 'select':
      return h('select', { class: 'input', id, name: f.key, value: value ?? f.default ?? '' },
        f.options.map((o) => (typeof o === 'object'
          ? h('option', { value: o.value }, o.label)
          : h('option', { value: o }, o))));
    case 'textarea':
      return h('textarea', { class: 'input', id, name: f.key, rows: f.rows || 3, placeholder: f.placeholder || '', value: value ?? '' });
    case 'number':
      return h('div', { class: 'input-unit' },
        h('input', { class: 'input', id, name: f.key, type: 'text', inputmode: 'decimal', placeholder: f.placeholder || '', value: value ?? '' }),
        f.unit ? h('span', { class: 'unit' }, f.unit) : null);
    case 'datetime':
      return h('input', { class: 'input', id, name: f.key, type: 'datetime-local', value: value ?? '' });
    case 'chips': {
      const selected = new Set(Array.isArray(value) ? value : []);
      return h('div', { class: 'chips', 'data-chips': f.key }, f.options.map((o) =>
        h('label', { class: 'chip chip-check' },
          h('input', { type: 'checkbox', value: o, checked: selected.has(o) }),
          h('span', null, o))));
    }
    case 'rating': {
      const wrap = h('div', { class: 'rating', 'data-rating': f.key, 'data-value': value || 0 });
      const paint = () => wrap.querySelectorAll('button').forEach((b, i) => b.classList.toggle('on', i < Number(wrap.dataset.value)));
      for (let i = 1; i <= 5; i++) {
        wrap.append(h('button', { type: 'button', 'aria-label': `${i} sur 5`, onclick: () => {
          wrap.dataset.value = Number(wrap.dataset.value) === i ? 0 : i;
          paint();
        } }, icon('star')));
      }
      paint();
      return wrap;
    }
    default: {
      const el = h('input', { class: 'input', id, name: f.key, type: f.type || 'text', placeholder: f.placeholder || '', value: value ?? '', autocomplete: 'off' });
      if (f.datalist && f.datalist.length) {
        const listId = 'dl-' + (++dlCounter);
        el.setAttribute('list', listId);
        return h('div', null, el, h('datalist', { id: listId }, f.datalist.map((v) => h('option', { value: v }))));
      }
      return el;
    }
  }
}

function readValue(form, f) {
  if (f.type === 'rating') return Number(form.querySelector(`[data-rating="${f.key}"]`).dataset.value) || 0;
  if (f.type === 'chips') return [...form.querySelectorAll(`[data-chips="${f.key}"] input:checked`)].map((c) => c.value);
  const el = form.elements[f.key];
  const v = el ? el.value.trim() : '';
  if (f.type === 'number' && v !== '') {
    const n = Number(v.replace(/\s/g, '').replace(',', '.'));
    return Number.isNaN(n) ? NaN : n;
  }
  return v;
}

/**
 * @returns Promise<object|null> les valeurs saisies, ou null si annulé.
 * options.extraActions : [{ label, danger, value }] -> résout avec { _action: value }
 */
export function formDialog(title, fields, values = {}, { okLabel = 'Enregistrer', intro = null, extraActions = [] } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    const form = h('form', { class: 'form-grid dialog-form', novalidate: true },
      fields.map((f) => h('div', { class: 'field' + (f.full !== false ? ' full' : '') },
        f.label ? h('label', { for: 'dlg-' + f.key }, f.label, f.required ? ' *' : '') : null,
        input(f, values[f.key]),
        f.help ? h('p', { class: 'small muted field-help' }, f.help) : null)));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const out = {};
      for (const f of fields) {
        const v = readValue(form, f);
        if (Number.isNaN(v)) { toast(`« ${f.label} » doit être un nombre`); return; }
        if (f.required && (v === '' || v == null)) { toast(`« ${f.label} » est obligatoire`); form.elements[f.key]?.focus(); return; }
        out[f.key] = v;
      }
      finish(out);
      ctl.close();
    });
    const ctl = openOverlay([
      h('div', { class: 'sheet-title' }, title),
      intro ? h('p', { class: 'small muted dialog-intro' }, intro) : null,
      h('div', { class: 'dialog-scroll' }, form),
      ...extraActions.map((a) => h('button', {
        class: 'btn btn-ghost dialog-extra' + (a.danger ? ' danger-text' : ''), type: 'button',
        onclick: () => { finish({ _action: a.value }); ctl.close(); },
      }, a.icon ? icon(a.icon) : null, a.label)),
      h('div', { class: 'dialog-actions' },
        h('button', { class: 'btn', type: 'button', onclick: () => { finish(null); ctl.close(); } }, 'Annuler'),
        h('button', { class: 'btn btn-primary', type: 'button', onclick: () => (form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { cancelable: true }))) }, okLabel)),
    ], { kind: 'dialog', onClose: () => finish(null) });
  });
}

/** Champs d'un formulaire en page entière (même syntaxe que formDialog). */
export function fieldsGrid(fields, values = {}) {
  return h('div', { class: 'form-grid' }, fields.map((f) => h('div', { class: 'field' + (f.full ? ' full' : '') },
    f.label && f.type !== 'chips' ? h('label', { for: 'dlg-' + f.key }, f.label, f.required ? ' *' : '') : null,
    f.type === 'chips' && f.label ? h('label', null, f.label) : null,
    input(f, values[f.key]),
    f.help ? h('p', { class: 'small muted field-help' }, f.help) : null)));
}

/** Lit les champs ; retourne null (avec message) si une valeur est invalide. */
export function readFields(form, fields) {
  const out = {};
  for (const f of fields) {
    const v = readValue(form, f);
    if (Number.isNaN(v)) { toast(`« ${f.label} » doit être un nombre`); return null; }
    if (f.required && (v === '' || v == null)) { toast(`« ${f.label} » est obligatoire`); return null; }
    out[f.key] = v;
  }
  return out;
}

/** Petit utilitaire : valeur pour un <input type="datetime-local"> */
export function toLocalInput(iso) {
  const d = iso ? new Date(iso) : new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(v) {
  return v ? new Date(v).toISOString() : new Date().toISOString();
}
