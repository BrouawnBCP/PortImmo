// Journal du bien : visites, offres, changements de prix, notes, photos, documents.
// Affiché sur la fiche du bien (résumé + historique) avec des boutons d'ajout rapide.
import { h, fill, icon, toast, actionSheet, confirmDialog, fmtPrice, fmtDateTime, fmtDate, downloadFile } from '../ui.js';
import { listEvents, saveEvent, deleteEvent, listAcquereurs } from '../db.js';
import { formDialog, toLocalInput, fromLocalInput } from '../dialogs.js';
import { STATUTS } from '../config.js';

export const VISITE_STATUTS = [
  { value: 'prevue', label: 'Prévue' },
  { value: 'faite', label: 'Effectuée' },
  { value: 'annulee', label: 'Annulée' },
];
export const OFFRE_STATUTS = [
  { value: 'attente', label: 'En attente' },
  { value: 'acceptee', label: 'Acceptée' },
  { value: 'refusee', label: 'Refusée' },
  { value: 'retiree', label: 'Retirée' },
];
export const RAPPEL_STATUTS = [
  { value: 'a_faire', label: 'À faire' },
  { value: 'fait', label: 'Fait' },
];
export const RAPPEL_NATURES = ['Appel', 'Rendez-vous', 'Relance', 'Signature', 'Autre'];
const BADGE = { prevue: 'blue', faite: 'green', annulee: 'grey', attente: 'orange', acceptee: 'green', refusee: 'grey', retiree: 'grey', a_faire: 'blue', fait: 'green' };
const ICON = { visite: 'calendar', offre: 'euro', prix: 'tag', statut: 'flag', note: 'note', photo: 'camera', document: 'clip', rappel: 'bell' };
const label = (list, v) => (list.find((x) => x.value === v) || {}).label || v;
const statutLabel = (v) => label(STATUTS, v);

/** Nom affiché d'un acquéreur. */
export const acqName = (a) => [a.prenom, a.nom].filter(Boolean).join(' ') || 'Sans nom';

async function acquereurField() {
  const list = await listAcquereurs();
  return { list, datalist: list.map(acqName) };
}

function linkAcquereur(values, list) {
  const name = (values.acquereurNom || '').trim().toLowerCase();
  const match = list.find((a) => acqName(a).toLowerCase() === name);
  return { ...values, acquereurId: match ? match.id : null };
}

// ---------------------------------------------------------------------------
// Dialogues d'ajout / modification (utilisables depuis d'autres écrans)
// ---------------------------------------------------------------------------

export async function editVisite(bien, ev = null) {
  const { list, datalist } = await acquereurField();
  const v = await formDialog(ev ? 'Modifier la visite' : 'Nouvelle visite', [
    { key: 'date', label: 'Date et heure', type: 'datetime', required: true },
    { key: 'acquereurNom', label: 'Visiteur / acquéreur', datalist, placeholder: 'Nom du visiteur' },
    { key: 'statut', label: 'Statut', type: 'select', options: VISITE_STATUTS },
    { key: 'avis', label: 'Intérêt du visiteur', type: 'rating' },
    { key: 'compteRendu', label: 'Compte rendu', type: 'textarea', placeholder: 'Points positifs, objections, suite à donner…' },
  ], {
    ...ev,
    date: toLocalInput(ev ? ev.date : null),
    statut: ev ? ev.statut : 'prevue',
  });
  if (!v) return null;
  const saved = await saveEvent({ ...ev, ...linkAcquereur(v, list), type: 'visite', bienId: bien.id, date: fromLocalInput(v.date) });
  toast(ev ? 'Visite modifiée' : 'Visite ajoutée');
  return saved;
}

export async function editOffre(bien, ev = null, onAccept = null) {
  const { list, datalist } = await acquereurField();
  const v = await formDialog(ev ? "Modifier l'offre" : 'Nouvelle offre', [
    { key: 'montant', label: 'Montant proposé', type: 'number', unit: '€', required: true },
    { key: 'acquereurNom', label: 'Acquéreur', datalist, placeholder: "Nom de l'acquéreur" },
    { key: 'date', label: "Date de l'offre", type: 'datetime' },
    { key: 'statut', label: 'Statut', type: 'select', options: OFFRE_STATUTS },
    { key: 'conditions', label: 'Conditions', type: 'textarea', placeholder: 'Ex : sous condition suspensive de prêt, financement…' },
  ], { ...ev, date: toLocalInput(ev ? ev.date : null), statut: ev ? ev.statut : 'attente' });
  if (!v) return null;
  const saved = await saveEvent({ ...ev, ...linkAcquereur(v, list), type: 'offre', bienId: bien.id, date: fromLocalInput(v.date) });
  toast(ev ? 'Offre modifiée' : 'Offre enregistrée');
  if (saved.statut === 'acceptee' && (!ev || ev.statut !== 'acceptee') && onAccept) await onAccept(saved);
  return saved;
}

export async function editNote(bien, ev = null) {
  const v = await formDialog(ev ? 'Modifier la note' : 'Nouvelle note', [
    { key: 'texte', label: 'Note', type: 'textarea', rows: 4, required: true, placeholder: 'Ex : appel du propriétaire, prêt à baisser de 10 k€…' },
    { key: 'date', label: 'Date', type: 'datetime' },
  ], { ...ev, date: toLocalInput(ev ? ev.date : null) });
  if (!v) return null;
  return saveEvent({ ...ev, ...v, type: 'note', bienId: bien.id, date: fromLocalInput(v.date) });
}

/**
 * Rappel ou rendez-vous (appel à passer, relance, signature…). bien peut être null
 * (rappel général depuis l'accueil) : on peut alors choisir un bien dans la liste.
 */
export async function editRappel(bien, ev = null, biens = null) {
  const { list, datalist } = await acquereurField();
  const fields = [
    { key: 'nature', label: 'Type', type: 'select', options: RAPPEL_NATURES },
    { key: 'date', label: 'Date et heure', type: 'datetime', required: true },
    { key: 'acquereurNom', label: 'Contact', datalist, placeholder: 'Nom de la personne' },
    { key: 'telephone', label: 'Téléphone', type: 'tel', placeholder: 'Pour appeler en un geste' },
    { key: 'motif', label: 'Objet', type: 'textarea', rows: 2, placeholder: 'Ex : rappeler pour le retour de visite' },
    { key: 'statut', label: 'Statut', type: 'select', options: RAPPEL_STATUTS },
  ];
  if (!bien && biens) {
    fields.splice(2, 0, { key: 'bienId', label: 'Bien concerné', type: 'select', options: [{ value: '', label: 'Aucun' }, ...biens.map((b) => ({ value: b.id, label: b.titre || 'Sans titre' }))] });
  }
  const def = new Date(Date.now() + 3600e3);
  def.setMinutes(0, 0, 0);
  const v = await formDialog(ev ? 'Modifier le rappel' : 'Rappel ou rendez-vous', fields, {
    nature: 'Appel', ...ev,
    date: toLocalInput(ev ? ev.date : def.toISOString()),
    statut: ev ? ev.statut : 'a_faire',
  });
  if (!v) return null;
  const linked = linkAcquereur(v, list);
  if (!linked.telephone && linked.acquereurId) {
    const a = list.find((x) => x.id === linked.acquereurId);
    if (a && a.telephone) linked.telephone = a.telephone;
  }
  const bienId = bien ? bien.id : (v.bienId || (ev && ev.bienId) || null);
  const saved = await saveEvent({ ...ev, ...linked, type: 'rappel', bienId, date: fromLocalInput(v.date) });
  toast(ev ? 'Rappel modifié' : 'Rappel ajouté');
  return saved;
}

/** Menu d'actions d'un rappel (accueil et journal). */
export function rappelActions(ev, bien, onChange) {
  const actions = [];
  if (ev.statut !== 'fait') {
    actions.push({ icon: 'check', label: 'Marquer comme fait', onClick: async () => { await saveEvent({ ...ev, statut: 'fait' }); onChange(); } });
  }
  if (ev.telephone) {
    actions.push({ icon: 'phone', label: `Appeler ${ev.acquereurNom || ''} (${ev.telephone})`, onClick: () => { location.href = 'tel:' + ev.telephone.replace(/\s/g, ''); } });
  }
  actions.push({ icon: 'calendar', label: 'Ajouter au calendrier', onClick: () => exportIcs(bien, ev) });
  actions.push({ icon: 'edit', label: 'Modifier', onClick: async () => { if (await editRappel(bien, ev)) onChange(); } });
  if (bien) actions.push({ icon: 'building', label: 'Voir le bien', onClick: () => { location.hash = `#/bien/${encodeURIComponent(bien.id)}`; } });
  actions.push({ icon: 'trash', label: 'Supprimer', danger: true, onClick: async () => {
    if (await confirmDialog('Supprimer ce rappel ?', { okLabel: 'Supprimer', danger: true })) { await deleteEvent(ev.id); onChange(); }
  } });
  actionSheet(eventTitle(ev), actions);
}

// ---------------------------------------------------------------------------
// Export d'une visite / d'un rappel vers le calendrier du téléphone (.ics)
// ---------------------------------------------------------------------------

function icsDate(iso) {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}
const icsText = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

export const exportVisiteIcs = (bien, ev) => exportIcs(bien, ev);

export function exportIcs(bien, ev) {
  bien = bien || {};
  const start = new Date(ev.date);
  const end = new Date(start.getTime() + (ev.type === 'rappel' && ev.nature === 'Appel' ? 15 : 60) * 60 * 1000);
  const lieu = [bien.adresse, bien.codePostal, bien.ville].filter(Boolean).join(' ');
  const summary = ev.type === 'rappel'
    ? `${ev.nature || 'Rappel'}${ev.acquereurNom ? ' – ' + ev.acquereurNom : ''}${bien.titre ? ' (' + bien.titre + ')' : ''}`
    : `Visite – ${bien.titre || 'Bien'}${ev.acquereurNom ? ' (' + ev.acquereurNom + ')' : ''}`;
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//PortImmo//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${ev.id}@portimmo`,
    `DTSTAMP:${icsDate(new Date().toISOString())}`,
    `DTSTART:${icsDate(start.toISOString())}`,
    `DTEND:${icsDate(end.toISOString())}`,
    `SUMMARY:${icsText(summary)}`,
    lieu ? `LOCATION:${icsText(lieu)}` : null,
    `DESCRIPTION:${icsText([bien.reference ? 'Réf. ' + bien.reference : '', ev.telephone ? 'Tél. ' + ev.telephone : '', ev.motif, ev.compteRendu].filter(Boolean).join('\n'))}`,
    'BEGIN:VALARM', `TRIGGER:${ev.type === 'rappel' ? '-PT15M' : '-PT1H'}`, 'ACTION:DISPLAY', `DESCRIPTION:${icsText(summary)}`, 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');
  const name = `${ev.type === 'rappel' ? (ev.nature || 'Rappel') : 'Visite'} ${fmtDate(ev.date).replace(/\//g, '-')}.ics`;
  downloadFile(new File([ics], name, { type: 'text/calendar' }), name);
}

// ---------------------------------------------------------------------------
// Affichage
// ---------------------------------------------------------------------------

function stars(n) {
  if (!n) return null;
  return h('span', { class: 'stars', title: `${n}/5` }, Array.from({ length: 5 }, (_, i) => icon('star', i < n ? 'filled' : 'dim')));
}

export function eventTitle(ev) {
  switch (ev.type) {
    case 'visite': return 'Visite' + (ev.acquereurNom ? ' — ' + ev.acquereurNom : '');
    case 'offre': return `Offre de ${fmtPrice(ev.montant)}` + (ev.acquereurNom ? ' — ' + ev.acquereurNom : '');
    case 'prix': return `Prix : ${ev.ancien !== '' && ev.ancien != null ? fmtPrice(ev.ancien) : '—'} → ${fmtPrice(ev.nouveau)}`;
    case 'statut': return `Statut : ${statutLabel(ev.ancien)} → ${statutLabel(ev.nouveau)}`;
    case 'note': return 'Note';
    case 'photo': return `${ev.count} photo${ev.count > 1 ? 's' : ''} ajoutée${ev.count > 1 ? 's' : ''}` + (ev.pieceNom ? ' — ' + ev.pieceNom : '');
    case 'document': return 'Document ajouté — ' + (ev.nom || '');
    case 'rappel': return (ev.nature || 'Rappel') + (ev.acquereurNom ? ' — ' + ev.acquereurNom : '');
    default: return ev.type;
  }
}

const isPast = (iso) => new Date(iso).getTime() < Date.now() - 2 * 3600e3;

/** Visite prévue passée ou rappel non fait dépassé. */
export function enRetard(ev) {
  return (ev.type === 'visite' && ev.statut === 'prevue' && isPast(ev.date))
    || (ev.type === 'rappel' && ev.statut !== 'fait' && isPast(ev.date));
}

export function eventRow(ev, onClick, { showBien = null } = {}) {
  const status = ['visite', 'offre', 'rappel'].includes(ev.type) ? ev.statut : null;
  const statusLabel = ev.type === 'visite' ? label(VISITE_STATUTS, status) : ev.type === 'rappel' ? label(RAPPEL_STATUTS, status) : label(OFFRE_STATUTS, status);
  const aCompleter = enRetard(ev);
  const detail = ev.compteRendu || ev.conditions || ev.texte || ev.motif || '';
  return h('button', { class: 'event', type: 'button', onclick: onClick },
    h('span', { class: `event-icon ev-${ev.type}` }, icon(ICON[ev.type] || 'note')),
    h('span', { class: 'event-body' },
      h('span', { class: 'event-top' },
        h('span', { class: 'event-title' }, eventTitle(ev)),
        status ? h('span', { class: `badge badge-${BADGE[status] || 'grey'}` }, statusLabel) : null,
        aCompleter ? h('span', { class: 'badge badge-orange' }, ev.type === 'rappel' ? 'En retard' : 'À compléter') : null),
      showBien ? h('span', { class: 'event-bien' }, showBien) : null,
      h('span', { class: 'event-date muted' }, fmtDateTime(ev.date), ev.type === 'visite' ? stars(ev.avis) : null),
      detail ? h('span', { class: 'event-detail' }, detail) : null));
}

/**
 * Section « Journal du bien » de la fiche.
 * ctx : { getBien(), persist(bien), refresh(), addPhotos(), addDocument() }
 */
export async function renderJournal(section, ctx) {
  let showAll = false;
  let events = [];

  async function changeStatut(nouveau, raison) {
    const bien = ctx.getBien();
    if (bien.statut === nouveau) return;
    await saveEvent({ type: 'statut', bienId: bien.id, ancien: bien.statut || 'disponible', nouveau, motif: raison });
    bien.statut = nouveau;
    await ctx.persist(bien);
  }

  async function onOffreAcceptee(offre) {
    const bien = ctx.getBien();
    if (bien.statut === 'option' || bien.statut === 'vendu') return;
    const ok = await confirmDialog(`Offre acceptée ! Passer le bien en « Sous offre / compromis » ?`, { okLabel: 'Oui' });
    if (ok) await changeStatut('option', `Offre de ${fmtPrice(offre.montant)} acceptée`);
  }

  async function changePrix() {
    const bien = ctx.getBien();
    const v = await formDialog('Changement de prix', [
      { key: 'nouveau', label: 'Nouveau prix', type: 'number', unit: '€', required: true },
      { key: 'motif', label: 'Motif', placeholder: 'Ex : baisse après 3 mois sans offre' },
    ], { nouveau: bien.prix }, { intro: bien.prix ? `Prix actuel : ${fmtPrice(bien.prix)}` : null });
    if (!v || v.nouveau === bien.prix) return;
    await saveEvent({ type: 'prix', bienId: bien.id, ancien: bien.prix ?? '', nouveau: v.nouveau, motif: v.motif });
    bien.prix = v.nouveau;
    await ctx.persist(bien);
    toast('Prix mis à jour');
    ctx.refresh();
  }

  const refreshJournal = async () => { await draw(); };

  function openEvent(ev) {
    const bien = ctx.getBien();
    if (ev.type === 'rappel') { rappelActions(ev, bien, refreshJournal); return; }
    const actions = [];
    if (ev.type === 'visite') {
      if (ev.statut === 'prevue') {
        actions.push({ icon: 'check', label: 'Saisir le compte rendu', onClick: async () => { if (await editVisite(bien, { ...ev, statut: 'faite' })) refreshJournal(); } });
        actions.push({ icon: 'calendar', label: 'Ajouter au calendrier', onClick: () => exportVisiteIcs(bien, ev) });
      }
      actions.push({ icon: 'edit', label: 'Modifier', onClick: async () => { if (await editVisite(bien, ev)) refreshJournal(); } });
    } else if (ev.type === 'offre') {
      if (ev.statut === 'attente') {
        actions.push({ icon: 'check', label: "Accepter l'offre", onClick: async () => {
          const saved = await saveEvent({ ...ev, statut: 'acceptee' });
          await onOffreAcceptee(saved);
          ctx.refresh();
        } });
        actions.push({ icon: 'close', label: "Refuser l'offre", onClick: async () => { await saveEvent({ ...ev, statut: 'refusee' }); refreshJournal(); } });
      }
      actions.push({ icon: 'edit', label: 'Modifier', onClick: async () => { if (await editOffre(bien, ev, onOffreAcceptee)) ctx.refresh(); } });
    } else if (ev.type === 'note') {
      actions.push({ icon: 'edit', label: 'Modifier', onClick: async () => { if (await editNote(bien, ev)) refreshJournal(); } });
    }
    actions.push({ icon: 'trash', label: 'Supprimer de l’historique', danger: true, onClick: async () => {
      if (await confirmDialog('Supprimer cette ligne de l’historique ?', { okLabel: 'Supprimer', danger: true })) {
        await deleteEvent(ev.id);
        refreshJournal();
      }
    } });
    actionSheet(eventTitle(ev), actions);
  }

  async function draw() {
    const bien = ctx.getBien();
    events = await listEvents(bien.id);
    const now = Date.now();
    const prochaines = events.filter((e) => ((e.type === 'visite' && e.statut === 'prevue') || (e.type === 'rappel' && e.statut !== 'fait'))
      && new Date(e.date).getTime() >= now - 2 * 3600e3)
      .sort((a, b) => a.date.localeCompare(b.date));
    const offresAttente = events.filter((e) => e.type === 'offre' && e.statut === 'attente');
    const meilleure = offresAttente.reduce((m, e) => (Number(e.montant) > (m ? Number(m.montant) : 0) ? e : m), null);
    const nbVisites = events.filter((e) => e.type === 'visite' && e.statut === 'faite').length;

    const add = (ic, lbl, fn) => h('button', { class: 'quick-add', type: 'button', onclick: fn }, icon(ic), h('span', null, lbl));
    const shown = showAll ? events : events.slice(0, 6);

    fill(section,
      h('div', { class: 'section-head' }, h('h3', null, 'Journal du bien')),
      h('div', { class: 'quick-adds' },
        add('calendar', 'Visite', async () => { if (await editVisite(bien)) refreshJournal(); }),
        add('euro', 'Offre', async () => { if (await editOffre(bien, null, onOffreAcceptee)) ctx.refresh(); }),
        add('bell', 'Rappel', async () => { if (await editRappel(bien)) refreshJournal(); }),
        add('tag', 'Prix', changePrix),
        add('note', 'Note', async () => { if (await editNote(bien)) refreshJournal(); }),
        add('camera', 'Photo', () => ctx.addPhotos()),
        add('clip', 'Document', () => ctx.addDocument())),
      h('div', { class: 'summary-cards' },
        h('div', { class: 'summary-card' },
          h('div', { class: 'summary-label' }, 'À venir'),
          prochaines.length
            ? [h('div', { class: 'summary-value' }, fmtDateTime(prochaines[0].date)),
              h('div', { class: 'small muted' }, eventTitle(prochaines[0]), prochaines.length > 1 ? ` (+${prochaines.length - 1})` : '')]
            : h('div', { class: 'summary-value muted' }, 'Aucune')),
        h('div', { class: 'summary-card' },
          h('div', { class: 'summary-label' }, 'Offres en attente'),
          offresAttente.length
            ? [h('div', { class: 'summary-value' }, String(offresAttente.length)),
              h('div', { class: 'small muted' }, 'Meilleure : ' + fmtPrice(meilleure.montant))]
            : h('div', { class: 'summary-value muted' }, 'Aucune')),
        h('div', { class: 'summary-card' },
          h('div', { class: 'summary-label' }, 'Visites effectuées'),
          h('div', { class: 'summary-value' }, String(nbVisites)))),
      events.length
        ? h('div', { class: 'events' }, shown.map((ev) => eventRow(ev, () => openEvent(ev))))
        : h('p', { class: 'muted small' }, 'Aucune activité pour le moment. Utilisez les boutons ci-dessus pour suivre les visites, offres et changements de prix.'),
      events.length > 6
        ? h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => { showAll = !showAll; draw(); } },
          showAll ? 'Réduire' : `Tout afficher (${events.length})`)
        : null,
    );
  }

  await draw();
  return { refresh: draw, changeStatut };
}
