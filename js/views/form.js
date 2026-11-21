import { h, icon, toast, confirmDialog } from '../ui.js';
import { getBien, saveBien, saveEvent, listAcquereurs } from '../db.js';
import { isVendeur } from '../matching.js';
import { acqName } from './journal.js';
import { quickCreateVendeur } from './contacts.js';
import { SECTIONS } from '../config.js';
import { setTopbar } from '../app.js';
import { formDialog } from '../dialogs.js';
import { generateDescription } from '../describe.js';

const optValue = (o) => (typeof o === 'object' ? o.value : o);
const optLabel = (o) => (typeof o === 'object' ? o.label : o);

function fieldInput(f, value) {
  const id = 'f-' + f.key;
  switch (f.type) {
    case 'select': {
      const opts = [h('option', { value: '' }, '—'), ...f.options.map((o) => h('option', { value: optValue(o) }, optLabel(o)))];
      // Si la valeur enregistrée n'existe plus dans la config, on la garde quand même.
      if (value && !f.options.some((o) => optValue(o) === value)) opts.push(h('option', { value }, value));
      return h('select', { class: 'input', id, name: f.key, value: value ?? f.default ?? '' }, opts);
    }
    case 'textarea':
      return h('textarea', { class: 'input', id, name: f.key, rows: f.rows || 4, placeholder: f.placeholder || '', value: value ?? '' });
    case 'chips': {
      const selected = new Set(Array.isArray(value) ? value : []);
      const all = [...f.options, ...[...selected].filter((v) => !f.options.includes(v))];
      return h('div', { class: 'chips', 'data-chips': f.key }, all.map((o) =>
        h('label', { class: 'chip chip-check' },
          h('input', { type: 'checkbox', value: o, checked: selected.has(o) }),
          h('span', null, o))));
    }
    case 'number':
      return h('div', { class: 'input-unit' },
        h('input', { class: 'input', id, name: f.key, type: 'text', inputmode: 'decimal', placeholder: f.placeholder || '', value: value ?? '' }),
        f.unit ? h('span', { class: 'unit' }, f.unit) : null);
    default:
      return h('input', {
        class: 'input', id, name: f.key, type: f.type || 'text', inputmode: f.inputmode,
        placeholder: f.placeholder || '', value: value ?? '', autocomplete: 'off',
      });
  }
}

function customFieldRow(cf = { label: '', value: '' }) {
  const row = h('div', { class: 'custom-row' },
    h('input', { class: 'input', placeholder: 'Nom du champ', value: cf.label, 'data-cf': 'label' }),
    h('input', { class: 'input', placeholder: 'Valeur', value: cf.value, 'data-cf': 'value' }),
    h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Supprimer ce champ', onclick: () => row.remove() }, icon('trash')));
  return row;
}

export async function renderForm(view, id, { vendeurId: presetVendeur = null } = {}) {
  const existing = id ? await getBien(id) : null;
  if (id && !existing) { location.hash = '#/biens'; return; }
  const bien = existing || (presetVendeur ? { vendeurId: presetVendeur } : {});
  const backHref = existing ? `#/bien/${encodeURIComponent(id)}` : presetVendeur ? `#/contact/${encodeURIComponent(presetVendeur)}` : '#/biens';

  setTopbar({ title: existing ? 'Modifier le bien' : 'Nouveau bien', back: backHref });

  const form = h('form', { class: 'form', novalidate: true });

  // ---- Vendeur (fiche Contact liée) ----
  const contacts = await listAcquereurs();
  const vendeurSelect = h('select', { class: 'input', id: 'f-vendeur' });
  const fillVendeurs = (selected) => {
    const list = contacts
      .filter((c) => isVendeur(c) || c.id === selected)
      .sort((a, b) => acqName(a).localeCompare(acqName(b), 'fr'));
    vendeurSelect.replaceChildren(
      h('option', { value: '' }, list.length ? '— Aucun vendeur lié —' : '— Aucune fiche vendeur —'),
      ...list.map((c) => h('option', { value: c.id }, acqName(c) + (c.telephone ? ` · ${c.telephone}` : ''))));
    vendeurSelect.value = selected || '';
  };
  fillVendeurs(bien.vendeurId || '');
  const vendeurField = h('div', { class: 'field full vendeur-field' },
    h('label', { for: 'f-vendeur' }, 'Vendeur (propriétaire)'),
    h('div', { class: 'vendeur-pick' },
      vendeurSelect,
      h('button', { class: 'btn btn-sm', type: 'button', onclick: async () => {
        const v = await quickCreateVendeur();
        if (!v) return;
        contacts.push(v);
        fillVendeurs(v.id);
      } }, icon('plus'), 'Nouveau vendeur')),
    h('p', { class: 'small muted field-help' }, 'Le vendeur a sa propre fiche dans Contacts, avec la liste de ses biens.'));

  SECTIONS.forEach((s, i) => {
    form.append(h('details', { class: 'form-section', open: i < 2 || !!existing || (s.id === 'proprietaire' && !!presetVendeur) },
      h('summary', null, s.title, s.private ? h('span', { class: 'badge badge-grey' }, 'Privé') : null),
      h('div', { class: 'form-grid' }, s.id === 'proprietaire' ? vendeurField : null, s.fields.map((f) =>
        h('div', { class: 'field' + (f.full || f.type === 'textarea' || f.type === 'chips' ? ' full' : '') },
          f.type === 'chips' ? null : h('label', { for: 'f-' + f.key }, f.label, f.required ? ' *' : ''),
          fieldInput(f, bien[f.key]))))));
  });

  // Champs personnalisés
  const customList = h('div', { class: 'custom-list' }, (bien.champsPerso || []).map(customFieldRow));
  form.append(h('details', { class: 'form-section', open: true },
    h('summary', null, 'Champs personnalisés'),
    h('p', { class: 'muted small' }, 'Ajoutez n’importe quelle information qui ne figure pas ci-dessus (ex : « Copropriété : 12 lots »).'),
    customList,
    h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => { const r = customFieldRow(); customList.append(r); r.querySelector('input').focus(); } },
      icon('plus'), 'Ajouter un champ')));

  form.append(h('div', { class: 'form-actions' },
    h('a', { class: 'btn', href: backHref }, 'Annuler'),
    h('button', { class: 'btn btn-primary', type: 'submit' }, icon('check'), existing ? 'Enregistrer' : 'Créer le bien')));

  /** Lit les valeurs du formulaire. strict : signale les nombres invalides (sinon les ignore). */
  function collect(strict) {
    const data = { ...bien };
    for (const s of SECTIONS) {
      for (const f of s.fields) {
        if (f.type === 'chips') {
          data[f.key] = [...form.querySelectorAll(`[data-chips="${f.key}"] input:checked`)].map((c) => c.value);
          continue;
        }
        const el = form.elements[f.key];
        let v = el ? el.value.trim() : '';
        if (f.type === 'number' && v !== '') {
          const n = Number(v.replace(/\s/g, '').replace(',', '.'));
          if (Number.isNaN(n)) {
            if (!strict) { v = ''; } else {
              toast(`« ${f.label} » doit être un nombre`);
              el.closest('details').open = true;
              el.focus();
              return null;
            }
          } else v = n;
        }
        data[f.key] = v;
      }
    }
    if (vendeurSelect.value) data.vendeurId = vendeurSelect.value;
    else delete data.vendeurId;
    data.champsPerso = [...customList.querySelectorAll('.custom-row')]
      .map((r) => ({ label: r.querySelector('[data-cf=label]').value.trim(), value: r.querySelector('[data-cf=value]').value.trim() }))
      .filter((c) => c.label || c.value);
    return data;
  }

  // Générateur de description : aperçu modifiable avant de remplacer le texte
  const descEl = form.elements.description;
  if (descEl) {
    descEl.closest('.field').append(h('button', {
      class: 'btn btn-ghost btn-sm', type: 'button',
      onclick: async () => {
        const text = generateDescription(collect(false));
        const v = await formDialog('Description proposée', [
          { key: 'texte', type: 'textarea', rows: 12 },
        ], { texte: text }, {
          okLabel: descEl.value.trim() ? 'Remplacer le texte' : 'Utiliser ce texte',
          intro: 'Relisez et modifiez le texte si besoin. Il ne sera enregistré qu’après « Enregistrer » en bas du formulaire.',
        });
        if (v && v.texte) { descEl.value = v.texte; toast('Description insérée — pensez à enregistrer'); }
      },
    }, icon('sparkles'), 'Générer à partir des infos'));
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = collect(true);
    if (!data) return;

    if (!data.titre) {
      const ok = await confirmDialog('Le bien n’a pas de titre. Enregistrer quand même ?', { okLabel: 'Enregistrer' });
      if (!ok) { form.elements.titre.focus(); return; }
    }

    const saved = await saveBien(data);
    // Historique : changements de prix et de statut
    if (existing) {
      if (existing.prix !== saved.prix && saved.prix !== '') {
        await saveEvent({ type: 'prix', bienId: saved.id, ancien: existing.prix ?? '', nouveau: saved.prix });
      }
      if ((existing.statut || 'disponible') !== (saved.statut || 'disponible')) {
        await saveEvent({ type: 'statut', bienId: saved.id, ancien: existing.statut || 'disponible', nouveau: saved.statut || 'disponible' });
      }
    }
    toast(existing ? 'Modifications enregistrées' : 'Bien créé — ajoutez maintenant les photos par pièce');
    location.hash = `#/bien/${encodeURIComponent(saved.id)}`;
  });

  view.append(form);
}
