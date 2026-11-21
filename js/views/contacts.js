// Contacts : acquéreurs et vendeurs (une même personne peut être les deux).
// - Acquéreur : critères de recherche + biens correspondants (rapprochement automatique).
// - Vendeur : biens qui lui appartiennent (liés depuis le formulaire du bien).
// Stockage : magasin « acquereurs » (nom historique), champ roles = ['acquereur'] / ['vendeur'] / les deux.
import { h, fill, icon, toast, confirmDialog, actionSheet, blobUrl, fmtPrice, fmtNum, fmtDate, pickFiles } from '../ui.js';
import { canPickContacts, pickContact, parseVcard } from '../contacts.js';
import { listAcquereurs, getAcquereur, saveAcquereur, deleteAcquereur, listBiens, listEvents, getCoverThumb, putBienSilently } from '../db.js';
import { TYPES_BIEN, SECTIONS } from '../config.js';
import { setTopbar, isCurrent } from '../app.js';
import { fieldsGrid, readFields, formDialog } from '../dialogs.js';
import { biensPour, acquereursPour, budgetText, rolesOf, isAcquereur, isVendeur } from '../matching.js';
import { acqName, eventRow, editVisite, editOffre } from './journal.js';
import { statutInfo } from './list.js';

const EQUIPEMENTS = (SECTIONS.flatMap((s) => s.fields).find((f) => f.key === 'equipements') || { options: [] }).options;

export const ROLES = [
  { value: 'acquereur', label: 'Acquéreur', icon: 'search' },
  { value: 'vendeur', label: 'Vendeur', icon: 'building' },
];
const roleLabel = (r) => (ROLES.find((x) => x.value === r) || {}).label || r;

export const COORD_FIELDS = [
  // « autocomplete » : sur iPhone, Safari propose alors de remplir depuis les Contacts.
  { key: 'prenom', label: 'Prénom', autocomplete: 'given-name' },
  { key: 'nom', label: 'Nom', required: true, autocomplete: 'family-name' },
  { key: 'telephone', label: 'Téléphone', type: 'tel', autocomplete: 'tel' },
  { key: 'email', label: 'E-mail', type: 'email', autocomplete: 'email' },
  { key: 'adresse', label: 'Adresse', full: true, autocomplete: 'street-address' },
  { key: 'statut', label: 'Statut', type: 'select', options: [{ value: 'actif', label: 'Actif' }, { value: 'inactif', label: 'Archivé (plus en cours)' }] },
  { key: 'notes', label: 'Notes', type: 'textarea', full: true, placeholder: 'Situation, délais, motivations…' },
];
export const CRITERES_FIELDS = [
  { key: 'transaction', label: 'Projet', type: 'select', options: [{ value: 'Vente', label: 'Achat' }, { value: 'Location', label: 'Location' }, { value: 'Viager', label: 'Viager' }] },
  { key: 'financement', label: 'Financement', type: 'select', options: ['Non renseigné', 'Comptant', 'Prêt accordé', 'Accord de principe', 'Prêt à obtenir', 'Vente préalable nécessaire'] },
  { key: 'budgetMin', label: 'Budget minimum', type: 'number', unit: '€' },
  { key: 'budgetMax', label: 'Budget maximum', type: 'number', unit: '€' },
  { key: 'villes', label: 'Villes / secteurs', full: true, placeholder: 'Ex : Le Cannet, Cannes, Mougins (ou 06)', help: 'Séparez par des virgules. Un numéro de département (ex : 06) fonctionne aussi.' },
  { key: 'types', label: 'Types de bien', type: 'chips', options: TYPES_BIEN, full: true },
  { key: 'surfaceMin', label: 'Surface minimum', type: 'number', unit: 'm²' },
  { key: 'piecesMin', label: 'Pièces minimum', type: 'number' },
  { key: 'chambresMin', label: 'Chambres minimum', type: 'number' },
  { key: 'terrainMin', label: 'Terrain minimum', type: 'number', unit: 'm²' },
  { key: 'equipements', label: 'Équipements souhaités', type: 'chips', options: EQUIPEMENTS, full: true },
];

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const initial = (c) => (c.prenom || c.nom || '?').charAt(0).toUpperCase();
const state = { q: '', filtre: 'tous' };

export function roleBadges(c) {
  return rolesOf(c).map((r) => h('span', { class: `badge role-${r}` }, roleLabel(r)));
}

// ---------------------------------------------------------------------------
// Liste
// ---------------------------------------------------------------------------
export async function renderContacts(view) {
  setTopbar({ title: 'Contacts' });
  const [contacts, biens] = await Promise.all([listAcquereurs(), listBiens()]);
  const results = h('div', { class: 'acq-list' });
  const FILTRES = [
    ['tous', 'Tous', (c) => c.statut !== 'inactif'],
    ['acquereurs', 'Acquéreurs', (c) => c.statut !== 'inactif' && isAcquereur(c)],
    ['vendeurs', 'Vendeurs', (c) => c.statut !== 'inactif' && isVendeur(c)],
    ['archives', 'Archivés', (c) => c.statut === 'inactif'],
  ];

  const search = h('input', {
    class: 'input search-input', type: 'search', placeholder: 'Rechercher (nom, ville, téléphone…)', value: state.q,
    oninput: (e) => { state.q = e.target.value; refresh(); },
  });
  const chips = h('div', { class: 'chips chips-scroll' }, FILTRES.map(([id, label]) =>
    h('button', { class: 'chip' + (state.filtre === id ? ' active' : ''), type: 'button', 'data-id': id, onclick: () => {
      state.filtre = id;
      chips.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c.dataset.id === id));
      refresh();
    } }, label)));

  view.append(
    h('div', { class: 'list-toolbar' }, h('div', { class: 'search' }, icon('search'), search), chips),
    results,
    h('button', { class: 'fab', type: 'button', onclick: () => actionSheet('Nouveau contact', [
      { icon: 'search', label: 'Acquéreur (cherche un bien)', onClick: () => { location.hash = '#/contact/nouveau/acquereur'; } },
      { icon: 'building', label: 'Vendeur (propriétaire)', onClick: () => { location.hash = '#/contact/nouveau/vendeur'; } },
    ]) }, icon('plus'), h('span', null, 'Nouveau contact')));

  function refresh() {
    const q = norm(state.q).trim();
    const test = (FILTRES.find((f) => f[0] === state.filtre) || FILTRES[0])[2];
    const list = contacts
      .filter(test)
      .filter((c) => !q || norm([c.prenom, c.nom, c.telephone, c.email, c.villes, c.notes, c.adresse].join(' ')).includes(q))
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    results.replaceChildren();
    if (!contacts.length) {
      results.append(h('div', { class: 'empty' },
        icon('users', 'icon-xl'),
        h('h2', null, 'Aucun contact'),
        h('p', { class: 'muted' }, 'Enregistrez vos acquéreurs (avec leurs critères) et vos vendeurs (avec leurs biens).'),
        h('div', { class: 'btn-row' },
          h('a', { class: 'btn btn-primary', href: '#/contact/nouveau/acquereur' }, icon('plus'), 'Acquéreur'),
          h('a', { class: 'btn', href: '#/contact/nouveau/vendeur' }, icon('plus'), 'Vendeur'))));
      return;
    }
    if (!list.length) { results.append(h('div', { class: 'empty' }, h('p', { class: 'muted' }, 'Aucun contact ne correspond.'))); return; }
    list.forEach((c) => {
      const nbMatch = isAcquereur(c) ? biensPour(c, biens, 50).length : 0;
      const nbBiens = isVendeur(c) ? biens.filter((b) => b.vendeurId === c.id).length : 0;
      results.append(h('a', { class: 'acq-card', href: `#/contact/${encodeURIComponent(c.id)}` },
        h('span', { class: 'avatar' + (isVendeur(c) && !isAcquereur(c) ? ' avatar-vendeur' : '') }, initial(c)),
        h('span', { class: 'acq-body' },
          h('span', { class: 'acq-name' }, acqName(c)),
          h('span', { class: 'role-row' }, roleBadges(c), c.statut === 'inactif' ? h('span', { class: 'badge badge-grey' }, 'Archivé') : null),
          h('span', { class: 'small muted' }, isAcquereur(c)
            ? [budgetText(c), c.villes].filter(Boolean).join(' · ')
            : [c.telephone, c.email].filter(Boolean).join(' · '))),
        isAcquereur(c)
          ? h('span', { class: 'match-count' + (nbMatch ? ' has' : '') }, String(nbMatch), h('small', null, nbMatch > 1 ? 'biens' : 'bien'))
          : h('span', { class: 'match-count' + (nbBiens ? ' has-v' : '') }, String(nbBiens), h('small', null, nbBiens > 1 ? 'biens' : 'bien'))));
    });
  }
  refresh();
}

// ---------------------------------------------------------------------------
// Fiche contact
// ---------------------------------------------------------------------------
export async function renderContact(view, id, token) {
  const c = await getAcquereur(id);
  if (!c) { toast('Contact introuvable'); location.hash = '#/contacts'; return; }
  const [biens, events] = await Promise.all([listBiens(), listEvents()]);
  if (!isCurrent(token)) return;

  setTopbar({
    title: acqName(c),
    back: '#/contacts',
    actions: [
      { icon: 'edit', label: 'Modifier', onClick: () => { location.hash = `#/contact/${encodeURIComponent(id)}/modifier`; } },
      { icon: 'more', label: 'Plus', onClick: () => actionSheet(acqName(c), [
        { icon: 'edit', label: 'Modifier', onClick: () => { location.hash = `#/contact/${encodeURIComponent(id)}/modifier`; } },
        { icon: 'flag', label: c.statut === 'inactif' ? 'Réactiver' : 'Archiver', onClick: async () => {
          await saveAcquereur({ ...c, statut: c.statut === 'inactif' ? 'actif' : 'inactif' });
          window.dispatchEvent(new HashChangeEvent('hashchange'));
        } },
        { icon: 'trash', label: 'Supprimer', danger: true, onClick: async () => {
          const owned = biens.filter((b) => b.vendeurId === id);
          const msg = owned.length
            ? `Supprimer « ${acqName(c)} » ? Ses ${owned.length} bien(s) seront conservés mais n'auront plus de vendeur lié.`
            : `Supprimer « ${acqName(c)} » ?`;
          if (!(await confirmDialog(msg, { okLabel: 'Supprimer', danger: true }))) return;
          for (const b of owned) { delete b.vendeurId; await putBienSilently(b); }
          await deleteAcquereur(id);
          toast('Contact supprimé');
          location.hash = '#/contacts';
        } },
      ]) },
    ],
  });

  const tel = (c.telephone || '').replace(/\s/g, '');
  const contact = [
    tel && h('a', { class: 'btn btn-sm', href: 'tel:' + tel }, icon('phone'), 'Appeler'),
    tel && h('a', { class: 'btn btn-sm', href: 'sms:' + tel }, icon('message'), 'SMS'),
    c.email && h('a', { class: 'btn btn-sm', href: 'mailto:' + c.email }, icon('mail'), 'E-mail'),
  ].filter(Boolean);

  const sections = [];

  // ----- Vendeur : ses biens -----
  if (isVendeur(c)) {
    const owned = biens.filter((b) => b.vendeurId === id);
    sections.push(h('section', { class: 'section' },
      h('div', { class: 'section-head' },
        h('h3', null, `Biens du vendeur (${owned.length})`),
        h('a', { class: 'btn btn-sm', href: `#/bien/nouveau/vendeur/${encodeURIComponent(id)}` }, icon('plus'), 'Bien')),
      owned.length
        ? h('div', { class: 'matches' }, owned.map((b) => bienRow(b)))
        : h('p', { class: 'muted small' }, 'Aucun bien lié. Ajoutez un bien depuis ce bouton, ou choisissez ce vendeur dans le formulaire d’un bien existant.')));
  }

  // ----- Acquéreur : critères + biens correspondants -----
  if (isAcquereur(c)) {
    const crit = [
      ['Projet', c.transaction === 'Location' ? 'Location' : c.transaction === 'Viager' ? 'Viager' : 'Achat'],
      ['Budget', budgetText(c)],
      c.villes && ['Secteurs', c.villes],
      (c.types || []).length && ['Types', c.types.join(', ')],
      c.surfaceMin && ['Surface min.', `${fmtNum(c.surfaceMin)} m²`],
      c.piecesMin && ['Pièces min.', String(c.piecesMin)],
      c.chambresMin && ['Chambres min.', String(c.chambresMin)],
      c.terrainMin && ['Terrain min.', `${fmtNum(c.terrainMin)} m²`],
      (c.equipements || []).length && ['Souhaits', c.equipements.join(', ')],
      c.financement && c.financement !== 'Non renseigné' && ['Financement', c.financement],
    ].filter(Boolean);
    const matches = biensPour(c, biens);
    sections.push(
      h('section', { class: 'section' },
        h('div', { class: 'section-head' }, h('h3', null, 'Critères de recherche')),
        h('div', { class: 'info-grid' }, crit.map(([l, v]) => h('div', { class: 'info' + (l === 'Secteurs' || l === 'Souhaits' ? ' full' : '') }, h('div', { class: 'info-label' }, l), h('div', { class: 'info-value' }, v))))),
      h('section', { class: 'section' },
        h('div', { class: 'section-head' }, h('h3', null, `Biens correspondants (${matches.length})`)),
        matches.length
          ? h('div', { class: 'matches' }, matches.map((m) => bienRow(m.bien, m)))
          : h('p', { class: 'muted small' }, 'Aucun bien du portefeuille ne correspond pour le moment. Les critères éliminatoires sont : projet, type de bien, secteur et budget (marge de 5 %).')));
  }

  // ----- Historique (visites, offres, rappels avec ce contact) -----
  const myEvents = events.filter((e) => e.acquereurId === id);
  const biensById = Object.fromEntries(biens.map((b) => [b.id, b]));
  sections.push(h('section', { class: 'section' },
    h('div', { class: 'section-head' }, h('h3', null, 'Visites, offres & rappels')),
    myEvents.length
      ? h('div', { class: 'events' }, myEvents.map((ev) => eventRow(ev, async () => {
        const b = biensById[ev.bienId];
        if (!b) return;
        const changed = ev.type === 'visite' ? await editVisite(b, ev) : ev.type === 'offre' ? await editOffre(b, ev) : null;
        if (changed) window.dispatchEvent(new HashChangeEvent('hashchange'));
      }, { showBien: biensById[ev.bienId] ? biensById[ev.bienId].titre : '' })))
      : h('p', { class: 'muted small' }, 'Les visites, offres et rappels saisis avec le nom de ce contact apparaîtront ici.')));

  view.append(h('div', { class: 'detail' },
    h('div', { class: 'detail-head' },
      h('div', { class: 'acq-hero' },
        h('span', { class: 'avatar avatar-lg' + (isVendeur(c) && !isAcquereur(c) ? ' avatar-vendeur' : '') }, initial(c)),
        h('div', null,
          h('div', { class: 'role-row' }, roleBadges(c), c.statut === 'inactif' ? h('span', { class: 'badge badge-grey' }, 'Archivé') : null),
          h('h2', { class: 'detail-title' }, acqName(c)),
          h('div', { class: 'muted small' }, [c.telephone, c.email].filter(Boolean).join(' · ') || 'Aucune coordonnée'),
          c.adresse ? h('div', { class: 'muted small' }, c.adresse) : null)),
      contact.length ? h('div', { class: 'btn-row' }, contact) : null,
      c.notes ? h('p', { class: 'info-text contact-notes' }, c.notes) : null),
    sections,
    h('p', { class: 'muted small meta' }, `Créé le ${fmtDate(c.createdAt)} · modifié le ${fmtDate(c.updatedAt)}`)));
}

/** Ligne « bien » avec miniature (et raisons du rapprochement si fournies). */
function bienRow(b, m = null) {
  const st = statutInfo(b.statut);
  const thumb = h('span', { class: 'match-thumb' }, icon('image'));
  getCoverThumb(b).then((blob) => { if (blob) thumb.replaceChildren(h('img', { src: blobUrl(blob), alt: '' })); });
  return h('a', { class: 'match', href: `#/bien/${encodeURIComponent(b.id)}` },
    thumb,
    h('span', { class: 'match-body' },
      h('span', { class: 'match-title' }, b.titre || 'Sans titre'),
      h('span', { class: 'small muted' }, [b.prix ? fmtPrice(b.prix) : '', b.ville, b.surfaceHabitable ? fmtNum(b.surfaceHabitable) + ' m²' : ''].filter(Boolean).join(' · ')),
      m ? h('span', { class: 'match-reasons' },
        m.plus.slice(0, 3).map((p) => h('span', { class: 'reason ok' }, '✓ ' + p)),
        m.moins.slice(0, 3).map((p) => h('span', { class: 'reason ko' }, '✗ ' + p))) : null,
      h('span', null, h('span', { class: `badge badge-${st.color}` }, st.label))),
    m ? h('span', { class: 'score ' + (m.score >= 80 ? 'high' : m.score >= 50 ? 'mid' : 'low') }, `${m.score} %`) : null);
}

// ---------------------------------------------------------------------------
// Formulaire
// ---------------------------------------------------------------------------
export async function renderContactForm(view, id, presetRole = null) {
  const existing = id ? await getAcquereur(id) : null;
  if (id && !existing) { location.hash = '#/contacts'; return; }
  const c = existing || { statut: 'actif', transaction: 'Vente', financement: 'Non renseigné', roles: [presetRole || 'acquereur'] };
  const roles = new Set(rolesOf(c));
  const back = existing ? `#/contact/${encodeURIComponent(id)}` : '#/contacts';
  const titre = () => (existing ? 'Modifier le contact' : roles.has('vendeur') && !roles.has('acquereur') ? 'Nouveau vendeur' : roles.has('acquereur') && !roles.has('vendeur') ? 'Nouvel acquéreur' : 'Nouveau contact');
  setTopbar({ title: titre(), back });

  // ---- Rôles ----
  const roleBtns = h('div', { class: 'role-toggle' }, ROLES.map((r) => h('button', {
    class: 'role-btn' + (roles.has(r.value) ? ' on' : ''), type: 'button', 'data-role': r.value,
    onclick: (e) => {
      if (roles.has(r.value) && roles.size === 1) { toast('Choisissez au moins un rôle'); return; }
      roles.has(r.value) ? roles.delete(r.value) : roles.add(r.value);
      e.currentTarget.classList.toggle('on', roles.has(r.value));
      critSection.hidden = !roles.has('acquereur');
      if (!existing) setTopbar({ title: titre(), back });
    },
  }, icon(r.icon), r.label)));

  // ---- Remplir depuis les contacts du téléphone ----
  function applyContact(ct) {
    if (!ct) return;
    let n = 0;
    for (const k of ['prenom', 'nom', 'telephone', 'email']) {
      if (ct[k]) { form.elements[k].value = ct[k]; n++; }
    }
    toast(n ? 'Contact importé — vérifiez puis enregistrez' : 'Ce contact est vide');
  }
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const contactBar = h('div', { class: 'contact-import' },
    canPickContacts()
      ? h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: async () => {
        try { applyContact(await pickContact()); } catch (e) { console.error(e); toast('Accès aux contacts refusé ou indisponible'); }
      } }, icon('users'), 'Choisir dans mes contacts')
      : null,
    h('button', { class: 'btn btn-sm', type: 'button', onclick: async () => {
      const [file] = await pickFiles({ accept: '.vcf,text/vcard,text/x-vcard,text/directory' });
      if (!file) return;
      const ct = parseVcard(await file.text());
      if (!ct) { toast('Fiche contact illisible'); return; }
      applyContact(ct);
    } }, icon('upload'), 'Importer une fiche contact (.vcf)'),
    h('p', { class: 'small muted contact-help' },
      isIos
        ? 'Astuce iPhone : touchez le champ « Nom » puis « Contacts » au-dessus du clavier pour remplir depuis votre répertoire. Sinon : app Contacts → la personne → « Partager le contact » → « Enregistrer dans Fichiers », puis importez la fiche ici.'
        : canPickContacts()
          ? 'Choisissez une personne dans le répertoire du téléphone : nom, téléphone et e-mail seront remplis automatiquement.'
          : 'Vous pouvez importer une fiche contact (.vcf) exportée depuis votre téléphone ou votre messagerie.'));

  const critSection = h('details', { class: 'form-section', open: true }, h('summary', null, 'Critères de recherche (acquéreur)'), fieldsGrid(CRITERES_FIELDS, c));
  critSection.hidden = !roles.has('acquereur');

  const form = h('form', { class: 'form', novalidate: true },
    h('div', { class: 'form-section role-section' }, h('div', { class: 'role-title' }, 'Ce contact est :'), roleBtns),
    h('details', { class: 'form-section', open: true }, h('summary', null, 'Coordonnées'), contactBar, fieldsGrid(COORD_FIELDS, c)),
    critSection,
    h('div', { class: 'form-actions' },
      h('a', { class: 'btn', href: back }, 'Annuler'),
      h('button', { class: 'btn btn-primary', type: 'submit' }, icon('check'), existing ? 'Enregistrer' : 'Créer le contact')));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fields = roles.has('acquereur') ? [...COORD_FIELDS, ...CRITERES_FIELDS] : COORD_FIELDS;
    const v = readFields(form, fields);
    if (!v) return;
    const saved = await saveAcquereur({ ...c, ...v, roles: ROLES.map((r) => r.value).filter((r) => roles.has(r)) });
    toast(existing ? 'Contact enregistré' : 'Contact créé');
    location.hash = `#/contact/${encodeURIComponent(saved.id)}`;
  });
  view.append(form);
}

// ---------------------------------------------------------------------------
// Pour la fiche et le formulaire d'un bien
// ---------------------------------------------------------------------------

/** Création rapide d'un vendeur (depuis le formulaire d'un bien). Retourne le contact ou null. */
export async function quickCreateVendeur() {
  const v = await formDialog('Nouveau vendeur', COORD_FIELDS.filter((f) => ['prenom', 'nom', 'telephone', 'email'].includes(f.key)), {}, {
    okLabel: 'Créer le vendeur',
    intro: /iphone|ipad|ipod/i.test(navigator.userAgent) ? 'Astuce : touchez « Nom » puis « Contacts » au-dessus du clavier pour remplir depuis votre répertoire.' : null,
  });
  if (!v) return null;
  const saved = await saveAcquereur({ ...v, roles: ['vendeur'], statut: 'actif' });
  toast('Vendeur créé');
  return saved;
}

/** Encadré « Vendeur » sur la fiche d'un bien. */
export function vendeurCard(bien, contacts) {
  const v = bien.vendeurId ? contacts.find((c) => c.id === bien.vendeurId) : null;
  if (!v) return null;
  const tel = (v.telephone || '').replace(/\s/g, '');
  return h('div', { class: 'vendeur-card' },
    h('a', { class: 'vendeur-main', href: `#/contact/${encodeURIComponent(v.id)}` },
      h('span', { class: 'avatar avatar-vendeur' }, initial(v)),
      h('span', { class: 'acq-body' },
        h('span', { class: 'role-row' }, h('span', { class: 'badge role-vendeur' }, 'Vendeur')),
        h('span', { class: 'acq-name' }, acqName(v)),
        h('span', { class: 'small muted' }, [v.telephone, v.email].filter(Boolean).join(' · ')))),
    tel ? h('a', { class: 'icon-btn', href: 'tel:' + tel, 'aria-label': 'Appeler le vendeur' }, icon('phone')) : null);
}

/** Bloc « Acquéreurs intéressés » sur la fiche d'un bien. */
export async function renderAcquereursPourBien(section, bien) {
  const matches = acquereursPour(bien, await listAcquereurs());
  fill(section,
    h('div', { class: 'section-head' },
      h('h3', null, `Acquéreurs intéressés (${matches.length})`),
      h('a', { class: 'btn btn-sm', href: '#/contact/nouveau/acquereur' }, icon('plus'), 'Acquéreur')),
    matches.length
      ? h('div', { class: 'acq-list compact' }, matches.slice(0, 8).map((m) =>
        h('a', { class: 'acq-card', href: `#/contact/${encodeURIComponent(m.acq.id)}` },
          h('span', { class: 'avatar' }, initial(m.acq)),
          h('span', { class: 'acq-body' },
            h('span', { class: 'acq-name' }, acqName(m.acq)),
            h('span', { class: 'small muted' }, [budgetText(m.acq), m.acq.financement && m.acq.financement !== 'Non renseigné' ? m.acq.financement : ''].filter(Boolean).join(' · ')),
            m.moins.length ? h('span', { class: 'reason ko small' }, '✗ ' + m.moins[0]) : null),
          h('span', { class: 'score ' + (m.score >= 80 ? 'high' : m.score >= 50 ? 'mid' : 'low') }, `${m.score} %`))))
      : h('p', { class: 'muted small' }, 'Aucun acquéreur enregistré ne correspond à ce bien pour le moment.'));
}

/**
 * Migration (une seule fois) : les anciens champs « propriétaire » des biens deviennent des fiches vendeur.
 * Les acquéreurs existants reçoivent le rôle « acquéreur ».
 */
export async function migrateVendeurs() {
  const contacts = await listAcquereurs();
  for (const c of contacts) {
    if (!Array.isArray(c.roles)) await saveAcquereur({ ...c, roles: ['acquereur'], updatedAt: c.updatedAt });
  }
  const all = await listAcquereurs();
  let created = 0;
  for (const b of await listBiens()) {
    if (b.vendeurId || !String(b.proprioNom || '').trim()) continue;
    const full = b.proprioNom.trim().replace(/^(m\.|mme|mr|monsieur|madame)\s+/i, '');
    const parts = full.split(/\s+/);
    const prenom = parts.length > 1 ? parts.slice(0, -1).join(' ') : '';
    const nom = parts[parts.length - 1];
    let v = all.find((c) => norm(acqName(c)) === norm([prenom, nom].filter(Boolean).join(' ')));
    if (!v) {
      v = await saveAcquereur({ prenom, nom, telephone: b.proprioTel || '', email: b.proprioEmail || '', roles: ['vendeur'], statut: 'actif' });
      all.push(v);
      created++;
    } else if (!isVendeur(v)) {
      v = await saveAcquereur({ ...v, roles: [...rolesOf(v), 'vendeur'] });
    }
    b.vendeurId = v.id;
    await putBienSilently(b);
  }
  return created;
}
