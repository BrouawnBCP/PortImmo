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
const BADGE = { prevue: 'blue', faite: 'green', annulee: 'grey', attente: 'orange', acceptee: 'green', refusee: 'grey', retiree: 'grey' };
const ICON = { visite: 'calendar', offre: 'euro', prix: 'tag', statut: 'flag', note: 'note', photo: 'camera', document: 'clip' };
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

// ---------------------------------------------------------------------------
// Export d'une visite vers le calendrier du téléphone (.ics)
// ---------------------------------------------------------------------------

function icsDate(iso) {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}
const icsText = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

export function exportVisiteIcs(bien, ev) {
  const start = new Date(ev.date);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const lieu = [bien.adresse, bien.codePostal, bien.ville].filter(Boolean).join(' ');
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//PortImmo//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${ev.id}@portimmo`,
    `DTSTAMP:${icsDate(new Date().toISOString())}`,
    `DTSTART:${icsDate(start.toISOString())}`,
    `DTEND:${icsDate(end.toISOString())}`,
    `SUMMARY:${icsText(`Visite – ${bien.titre || 'Bien'}${ev.acquereurNom ? ' (' + ev.acquereurNom + ')' : ''}`)}`,
    lieu ? `LOCATION:${icsText(lieu)}` : null,
    `DESCRIPTION:${icsText([bien.reference ? 'Réf. ' + bien.reference : '', ev.compteRendu].filter(Boolean).join('\n'))}`,
    'BEGIN:VALARM', 'TRIGGER:-PT1H', 'ACTION:DISPLAY', 'DESCRIPTION:Visite dans 1 heure', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');
  downloadFile(new File([ics], `Visite ${fmtDate(ev.date).replace(/\//g, '-')}.ics`, { type: 'text/calendar' }), `Visite ${fmtDate(ev.date).replace(/\//g, '-')}.ics`);
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
    default: return ev.type;
  }
}

const isPast = (iso) => new Date(iso).getTime() < Date.now();

export function eventRow(ev, onClick, { showBien = null } = {}) {
  const status = ev.type === 'visite' ? ev.statut : ev.type === 'offre' ? ev.statut : null;
  const statusLabel = ev.type === 'visite' ? label(VISITE_STATUTS, status) : label(OFFRE_STATUTS, status);
  const aCompleter = ev.type === 'visite' && ev.statut === 'prevue' && isPast(ev.date);
  const detail = ev.compteRendu || ev.conditions || ev.texte || ev.motif || '';
  return h('button', { class: 'event', type: 'button', onclick: onClick },
    h('span', { class: `event-icon ev-${ev.type}` }, icon(ICON[ev.type] || 'note')),
    h('span', { class: 'event-body' },
      h('span', { class: 'event-top' },
        h('span', { class: 'event-title' }, eventTitle(ev)),
        status ? h('span', { class: `badge badge-${BADGE[status] || 'grey'}` }, statusLabel) : null,
        aCompleter ? h('span', { class: 'badge badge-orange' }, 'À compléter') : null),
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
    const prochaines = events.filter((e) => e.type === 'visite' && e.statut === 'prevue' && new Date(e.date).getTime() >= now - 2 * 3600e3)
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
        add('tag', 'Prix', changePrix),
        add('note', 'Note', async () => { if (await editNote(bien)) refreshJournal(); }),
        add('camera', 'Photo', () => ctx.addPhotos()),
        add('clip', 'Document', () => ctx.addDocument())),
      h('div', { class: 'summary-cards' },
        h('div', { class: 'summary-card' },
          h('div', { class: 'summary-label' }, 'Prochaine visite'),
          prochaines.length
            ? [h('div', { class: 'summary-value' }, fmtDateTime(prochaines[0].date)),
              h('div', { class: 'small muted' }, prochaines[0].acquereurNom || '', prochaines.length > 1 ? ` (+${prochaines.length - 1} autre${prochaines.length > 2 ? 's' : ''})` : '')]
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
