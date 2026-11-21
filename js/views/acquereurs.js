// Acquéreurs : liste, fiche (avec biens correspondants) et formulaire.
import { h, icon, toast, confirmDialog, actionSheet, blobUrl, fmtPrice, fmtNum, fmtDate } from '../ui.js';
import { listAcquereurs, getAcquereur, saveAcquereur, deleteAcquereur, listBiens, listEvents, getCoverThumb } from '../db.js';
import { TYPES_BIEN, SECTIONS } from '../config.js';
import { setTopbar, isCurrent } from '../app.js';
import { fieldsGrid, readFields } from '../dialogs.js';
import { biensPour, budgetText } from '../matching.js';
import { acqName, eventRow, editVisite, editOffre } from './journal.js';
import { statutInfo } from './list.js';

const EQUIPEMENTS = (SECTIONS.flatMap((s) => s.fields).find((f) => f.key === 'equipements') || { options: [] }).options;

export const ACQ_FIELDS = [
  { key: 'prenom', label: 'Prénom' },
  { key: 'nom', label: 'Nom', required: true },
  { key: 'telephone', label: 'Téléphone', type: 'tel' },
  { key: 'email', label: 'E-mail', type: 'email' },
  { key: 'statut', label: 'Statut', type: 'select', options: [{ value: 'actif', label: 'Actif (en recherche)' }, { value: 'inactif', label: 'Inactif / a trouvé' }] },
  { key: 'financement', label: 'Financement', type: 'select', options: ['Non renseigné', 'Comptant', 'Prêt accordé', 'Accord de principe', 'Prêt à obtenir', 'Vente préalable nécessaire'] },
];
export const CRITERES_FIELDS = [
  { key: 'transaction', label: 'Projet', type: 'select', options: [{ value: 'Vente', label: 'Achat' }, { value: 'Location', label: 'Location' }, { value: 'Viager', label: 'Viager' }] },
  { key: 'budgetMin', label: 'Budget minimum', type: 'number', unit: '€' },
  { key: 'budgetMax', label: 'Budget maximum', type: 'number', unit: '€' },
  { key: 'villes', label: 'Villes / secteurs', full: true, placeholder: 'Ex : Le Cannet, Cannes, Mougins (ou 06)', help: 'Séparez par des virgules. Un numéro de département (ex : 06) fonctionne aussi.' },
  { key: 'types', label: 'Types de bien', type: 'chips', options: TYPES_BIEN, full: true },
  { key: 'surfaceMin', label: 'Surface minimum', type: 'number', unit: 'm²' },
  { key: 'piecesMin', label: 'Pièces minimum', type: 'number' },
  { key: 'chambresMin', label: 'Chambres minimum', type: 'number' },
  { key: 'terrainMin', label: 'Terrain minimum', type: 'number', unit: 'm²' },
  { key: 'equipements', label: 'Équipements souhaités', type: 'chips', options: EQUIPEMENTS, full: true },
  { key: 'notes', label: 'Notes', type: 'textarea', full: true, placeholder: 'Situation, délais, motivations…' },
];

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const state = { q: '', filtre: 'actifs' };

// ---------------------------------------------------------------------------
// Liste
// ---------------------------------------------------------------------------
export async function renderAcquereurs(view) {
  setTopbar({ title: 'Acquéreurs' });
  const [acqs, biens] = await Promise.all([listAcquereurs(), listBiens()]);
  const results = h('div', { class: 'acq-list' });

  const search = h('input', {
    class: 'input search-input', type: 'search', placeholder: 'Rechercher (nom, ville, téléphone…)', value: state.q,
    oninput: (e) => { state.q = e.target.value; refresh(); },
  });
  const chips = h('div', { class: 'chips' }, [['actifs', 'Actifs'], ['inactifs', 'Inactifs'], ['tous', 'Tous']].map(([id, label]) =>
    h('button', { class: 'chip' + (state.filtre === id ? ' active' : ''), type: 'button', 'data-id': id, onclick: () => {
      state.filtre = id;
      chips.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c.dataset.id === id));
      refresh();
    } }, label)));

  view.append(
    h('div', { class: 'list-toolbar' }, h('div', { class: 'search' }, icon('search'), search), chips),
    results,
    h('a', { class: 'fab', href: '#/acquereur/nouveau' }, icon('plus'), h('span', null, 'Ajouter un acquéreur')));

  function refresh() {
    const q = norm(state.q).trim();
    const list = acqs
      .filter((a) => state.filtre === 'tous' || (state.filtre === 'actifs' ? a.statut !== 'inactif' : a.statut === 'inactif'))
      .filter((a) => !q || norm([a.prenom, a.nom, a.telephone, a.email, a.villes, a.notes].join(' ')).includes(q))
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    results.replaceChildren();
    if (!acqs.length) {
      results.append(h('div', { class: 'empty' },
        icon('users', 'icon-xl'),
        h('h2', null, 'Aucun acquéreur'),
        h('p', { class: 'muted' }, 'Enregistrez vos clients acquéreurs et leurs critères : l’application vous indiquera automatiquement les biens qui leur correspondent.'),
        h('a', { class: 'btn btn-primary', href: '#/acquereur/nouveau' }, icon('plus'), 'Ajouter un acquéreur')));
      return;
    }
    if (!list.length) { results.append(h('div', { class: 'empty' }, h('p', { class: 'muted' }, 'Aucun acquéreur ne correspond.'))); return; }
    list.forEach((a) => {
      const n = biensPour(a, biens, 50).length;
      results.append(h('a', { class: 'acq-card', href: `#/acquereur/${encodeURIComponent(a.id)}` },
        h('span', { class: 'avatar' }, (a.prenom || a.nom || '?').charAt(0).toUpperCase()),
        h('span', { class: 'acq-body' },
          h('span', { class: 'acq-name' }, acqName(a), a.statut === 'inactif' ? h('span', { class: 'badge badge-grey' }, 'Inactif') : null),
          h('span', { class: 'small muted' }, [budgetText(a), a.villes].filter(Boolean).join(' · ')),
          (a.types || []).length ? h('span', { class: 'small muted' }, a.types.join(', ')) : null),
        h('span', { class: 'match-count' + (n ? ' has' : '') }, String(n), h('small', null, n > 1 ? 'biens' : 'bien'))));
    });
  }
  refresh();
}

// ---------------------------------------------------------------------------
// Fiche acquéreur
// ---------------------------------------------------------------------------
export async function renderAcquereur(view, id, token) {
  const acq = await getAcquereur(id);
  if (!acq) { toast('Acquéreur introuvable'); location.hash = '#/acquereurs'; return; }
  const [biens, events] = await Promise.all([listBiens(), listEvents()]);
  if (!isCurrent(token)) return;

  setTopbar({
    title: acqName(acq),
    back: '#/acquereurs',
    actions: [
      { icon: 'edit', label: 'Modifier', onClick: () => { location.hash = `#/acquereur/${encodeURIComponent(id)}/modifier`; } },
      { icon: 'more', label: 'Plus', onClick: () => actionSheet(acqName(acq), [
        { icon: 'edit', label: 'Modifier', onClick: () => { location.hash = `#/acquereur/${encodeURIComponent(id)}/modifier`; } },
        { icon: 'flag', label: acq.statut === 'inactif' ? 'Marquer comme actif' : 'Marquer comme inactif', onClick: async () => {
          await saveAcquereur({ ...acq, statut: acq.statut === 'inactif' ? 'actif' : 'inactif' });
          window.dispatchEvent(new HashChangeEvent('hashchange'));
        } },
        { icon: 'trash', label: 'Supprimer', danger: true, onClick: async () => {
          if (!(await confirmDialog(`Supprimer « ${acqName(acq)} » ?`, { okLabel: 'Supprimer', danger: true }))) return;
          await deleteAcquereur(id);
          toast('Acquéreur supprimé');
          location.hash = '#/acquereurs';
        } },
      ]) },
    ],
  });

  const contact = [
    acq.telephone && h('a', { class: 'btn btn-sm', href: 'tel:' + acq.telephone.replace(/\s/g, '') }, icon('phone'), 'Appeler'),
    acq.telephone && h('a', { class: 'btn btn-sm', href: 'sms:' + acq.telephone.replace(/\s/g, '') }, icon('message'), 'SMS'),
    acq.email && h('a', { class: 'btn btn-sm', href: 'mailto:' + acq.email }, icon('mail'), 'E-mail'),
  ].filter(Boolean);

  const crit = [
    ['Projet', acq.transaction === 'Location' ? 'Location' : acq.transaction === 'Viager' ? 'Viager' : 'Achat'],
    ['Budget', budgetText(acq)],
    acq.villes && ['Secteurs', acq.villes],
    (acq.types || []).length && ['Types', acq.types.join(', ')],
    acq.surfaceMin && ['Surface min.', `${fmtNum(acq.surfaceMin)} m²`],
    acq.piecesMin && ['Pièces min.', String(acq.piecesMin)],
    acq.chambresMin && ['Chambres min.', String(acq.chambresMin)],
    acq.terrainMin && ['Terrain min.', `${fmtNum(acq.terrainMin)} m²`],
    (acq.equipements || []).length && ['Souhaits', acq.equipements.join(', ')],
    acq.financement && acq.financement !== 'Non renseigné' && ['Financement', acq.financement],
  ].filter(Boolean);

  const matches = biensPour(acq, biens);
  const matchList = h('div', { class: 'matches' });
  matches.forEach((m) => {
    const st = statutInfo(m.bien.statut);
    const thumb = h('span', { class: 'match-thumb' }, icon('image'));
    getCoverThumb(m.bien).then((b) => { if (b) thumb.replaceChildren(h('img', { src: blobUrl(b), alt: '' })); });
    matchList.append(h('a', { class: 'match', href: `#/bien/${encodeURIComponent(m.bien.id)}` },
      thumb,
      h('span', { class: 'match-body' },
        h('span', { class: 'match-title' }, m.bien.titre || 'Sans titre'),
        h('span', { class: 'small muted' }, [fmtPrice(m.bien.prix), m.bien.ville, m.bien.surfaceHabitable ? fmtNum(m.bien.surfaceHabitable) + ' m²' : ''].filter(Boolean).join(' · ')),
        h('span', { class: 'match-reasons' },
          m.plus.slice(0, 3).map((p) => h('span', { class: 'reason ok' }, '✓ ' + p)),
          m.moins.slice(0, 3).map((p) => h('span', { class: 'reason ko' }, '✗ ' + p))),
        m.bien.statut === 'option' ? h('span', { class: `badge badge-${st.color}` }, st.label) : null),
      h('span', { class: 'score ' + (m.score >= 80 ? 'high' : m.score >= 50 ? 'mid' : 'low') }, `${m.score} %`)));
  });

  const myEvents = events.filter((e) => e.acquereurId === id);
  const biensById = Object.fromEntries(biens.map((b) => [b.id, b]));

  view.append(h('div', { class: 'detail' },
    h('div', { class: 'detail-head' },
      h('div', { class: 'acq-hero' },
        h('span', { class: 'avatar avatar-lg' }, (acq.prenom || acq.nom || '?').charAt(0).toUpperCase()),
        h('div', null,
          h('h2', { class: 'detail-title' }, acqName(acq)),
          h('div', { class: 'muted small' }, [acq.telephone, acq.email].filter(Boolean).join(' · ') || 'Aucune coordonnée'),
          acq.statut === 'inactif' ? h('span', { class: 'badge badge-grey' }, 'Inactif') : null)),
      contact.length ? h('div', { class: 'btn-row' }, contact) : null),
    h('section', { class: 'section' },
      h('div', { class: 'section-head' }, h('h3', null, 'Critères de recherche')),
      h('div', { class: 'info-grid' }, crit.map(([l, v]) => h('div', { class: 'info' + (l === 'Secteurs' || l === 'Souhaits' ? ' full' : '') }, h('div', { class: 'info-label' }, l), h('div', { class: 'info-value' }, v)))),
      acq.notes ? h('p', { class: 'info-text', style: { marginTop: '12px' } }, acq.notes) : null),
    h('section', { class: 'section' },
      h('div', { class: 'section-head' }, h('h3', null, `Biens correspondants (${matches.length})`)),
      matches.length ? matchList : h('p', { class: 'muted small' }, 'Aucun bien du portefeuille ne correspond pour le moment. Les critères éliminatoires sont : projet, type de bien, secteur et budget (marge de 5 %).')),
    h('section', { class: 'section' },
      h('div', { class: 'section-head' }, h('h3', null, 'Visites & offres')),
      myEvents.length
        ? h('div', { class: 'events' }, myEvents.map((ev) => eventRow(ev, async () => {
          const b = biensById[ev.bienId];
          if (!b) return;
          const changed = ev.type === 'visite' ? await editVisite(b, ev) : ev.type === 'offre' ? await editOffre(b, ev) : null;
          if (changed) window.dispatchEvent(new HashChangeEvent('hashchange'));
        }, { showBien: biensById[ev.bienId] ? biensById[ev.bienId].titre : 'Bien supprimé' })))
        : h('p', { class: 'muted small' }, 'Les visites et offres saisies dans le journal d’un bien avec le nom de cet acquéreur apparaîtront ici.')),
    h('p', { class: 'muted small meta' }, `Créé le ${fmtDate(acq.createdAt)} · modifié le ${fmtDate(acq.updatedAt)}`)));
}

// ---------------------------------------------------------------------------
// Formulaire
// ---------------------------------------------------------------------------
export async function renderAcquereurForm(view, id) {
  const existing = id ? await getAcquereur(id) : null;
  if (id && !existing) { location.hash = '#/acquereurs'; return; }
  const acq = existing || { statut: 'actif', transaction: 'Vente', financement: 'Non renseigné' };
  const back = existing ? `#/acquereur/${encodeURIComponent(id)}` : '#/acquereurs';
  setTopbar({ title: existing ? "Modifier l'acquéreur" : 'Nouvel acquéreur', back });

  const all = [...ACQ_FIELDS, ...CRITERES_FIELDS];
  const form = h('form', { class: 'form', novalidate: true },
    h('details', { class: 'form-section', open: true }, h('summary', null, 'Coordonnées'), fieldsGrid(ACQ_FIELDS, acq)),
    h('details', { class: 'form-section', open: true }, h('summary', null, 'Critères de recherche'), fieldsGrid(CRITERES_FIELDS, acq)),
    h('div', { class: 'form-actions' },
      h('a', { class: 'btn', href: back }, 'Annuler'),
      h('button', { class: 'btn btn-primary', type: 'submit' }, icon('check'), existing ? 'Enregistrer' : 'Créer l’acquéreur')));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = readFields(form, all);
    if (!v) return;
    const saved = await saveAcquereur({ ...acq, ...v });
    toast(existing ? 'Acquéreur enregistré' : 'Acquéreur créé');
    location.hash = `#/acquereur/${encodeURIComponent(saved.id)}`;
  });
  view.append(form);
}

// ---------------------------------------------------------------------------
// Bloc « Acquéreurs intéressés » pour la fiche d'un bien
// ---------------------------------------------------------------------------
export async function renderAcquereursPourBien(section, bien) {
  const { acquereursPour } = await import('../matching.js');
  const matches = acquereursPour(bien, await listAcquereurs());
  section.replaceChildren(
    h('div', { class: 'section-head' },
      h('h3', null, `Acquéreurs intéressés (${matches.length})`),
      h('a', { class: 'btn btn-sm', href: '#/acquereur/nouveau' }, icon('plus'), 'Acquéreur')));
  if (!matches.length) {
    section.append(h('p', { class: 'muted small' }, 'Aucun acquéreur enregistré ne correspond à ce bien pour le moment.'));
    return;
  }
  section.append(h('div', { class: 'acq-list compact' }, matches.slice(0, 8).map((m) =>
    h('a', { class: 'acq-card', href: `#/acquereur/${encodeURIComponent(m.acq.id)}` },
      h('span', { class: 'avatar' }, (m.acq.prenom || m.acq.nom || '?').charAt(0).toUpperCase()),
      h('span', { class: 'acq-body' },
        h('span', { class: 'acq-name' }, acqName(m.acq)),
        h('span', { class: 'small muted' }, [budgetText(m.acq), m.acq.financement && m.acq.financement !== 'Non renseigné' ? m.acq.financement : ''].filter(Boolean).join(' · ')),
        m.moins.length ? h('span', { class: 'reason ko small' }, '✗ ' + m.moins[0]) : null),
      h('span', { class: 'score ' + (m.score >= 80 ? 'high' : m.score >= 50 ? 'mid' : 'low') }, `${m.score} %`)))));
}
