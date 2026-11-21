// Accueil : « À venir » (prochain rendez-vous ou appel), chiffres clés, « À traiter », « Vos biens ».
import { h, icon, blobUrl, fmtPrice, fmtNum, fmtDate, actionSheet } from '../ui.js';
import { listBiens, listEvents, listAcquereurs, getCoverThumb } from '../db.js';
import { setTopbar } from '../app.js';
import { getAgence } from '../agence.js';
import { backupReminder } from '../backup.js';
import { eventTitle, enRetard, rappelActions, editRappel, editVisite } from './journal.js';
import { acquereursPour } from '../matching.js';

const DAY = 86400e3;
const refresh = () => window.dispatchEvent(new HashChangeEvent('hashchange'));

function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); }

/** « Aujourd'hui », « Demain », « Jeudi », ou « 24 nov. » + heure. */
function quand(iso) {
  const d = new Date(iso);
  const diff = Math.round((startOfDay(d) - startOfDay(Date.now())) / DAY);
  const heure = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  let jour;
  if (diff === 0) jour = "Aujourd'hui";
  else if (diff === 1) jour = 'Demain';
  else if (diff > 1 && diff < 7) jour = d.toLocaleDateString('fr-FR', { weekday: 'long' }).replace(/^./, (c) => c.toUpperCase());
  else jour = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  return `${jour} · ${heure}`;
}

function bonjour() {
  const hh = new Date().getHours();
  return hh >= 18 || hh < 4 ? 'Bonsoir' : 'Bonjour';
}

export async function renderDashboard(view) {
  const [biens, events, acqs, agence, banner] = await Promise.all([listBiens(), listEvents(), listAcquereurs(), getAgence(), backupReminder()]);
  setTopbar({ title: agence.nom || "Port'Immo" });

  const byId = Object.fromEntries(biens.map((b) => [b.id, b]));
  const acqById = Object.fromEntries(acqs.map((a) => [a.id, a]));
  const now = Date.now();
  const actifs = biens.filter((b) => b.statut !== 'vendu' && b.statut !== 'archive');
  const prenom = (agence.conseiller || '').trim().split(/\s+/)[0];

  // ---------- À venir : visites prévues + rappels à faire ----------
  const aVenir = events
    .filter((e) => ((e.type === 'visite' && e.statut === 'prevue') || (e.type === 'rappel' && e.statut !== 'fait'))
      && new Date(e.date).getTime() >= now - 2 * 3600e3)
    .sort((a, b) => a.date.localeCompare(b.date));

  const telDe = (e) => e.telephone || (e.acquereurId && acqById[e.acquereurId] ? acqById[e.acquereurId].telephone : '');
  const openEv = (e) => {
    const bien = byId[e.bienId] || null;
    if (e.type === 'rappel') rappelActions(e, bien, refresh);
    else if (bien) location.hash = `#/bien/${encodeURIComponent(bien.id)}`;
  };

  let upcoming;
  if (aVenir.length) {
    const e = aVenir[0];
    const bien = byId[e.bienId];
    const tel = telDe(e);
    upcoming = h('div', { class: 'upcoming' },
      h('div', { class: 'upcoming-label' }, icon('clock'), 'À venir · ', h('strong', null, quand(e.date))),
      h('button', { class: 'upcoming-main', type: 'button', onclick: () => openEv(e) },
        h('span', { class: `event-icon ev-${e.type}` }, icon(e.type === 'visite' ? 'calendar' : e.nature === 'Appel' ? 'phone' : 'bell')),
        h('span', { class: 'upcoming-body' },
          h('span', { class: 'upcoming-title' }, eventTitle(e)),
          h('span', { class: 'small muted' }, [bien ? bien.titre : '', e.motif].filter(Boolean).join(' · ') || ' '))),
      tel || bien ? h('div', { class: 'upcoming-actions' },
        tel ? h('a', { class: 'btn btn-sm btn-primary', href: 'tel:' + tel.replace(/\s/g, '') }, icon('phone'), 'Appeler') : null,
        bien ? h('a', { class: 'btn btn-sm', href: `#/bien/${encodeURIComponent(bien.id)}` }, icon('building'), 'Voir le bien') : null) : null,
      aVenir.length > 1 ? h('div', { class: 'upcoming-next' },
        h('div', { class: 'summary-label' }, 'Ensuite'),
        aVenir.slice(1, 3).map((n) => h('button', { class: 'next-row', type: 'button', onclick: () => openEv(n) },
          h('span', { class: 'next-when' }, quand(n.date)),
          h('span', { class: 'next-title' }, eventTitle(n))))) : null);
  } else {
    upcoming = h('div', { class: 'upcoming' },
      h('div', { class: 'upcoming-label' }, icon('clock'), 'À venir'),
      h('p', { class: 'muted', style: { margin: '6px 0 10px' } }, 'Aucun rendez-vous ni appel prévu.'),
      h('button', { class: 'btn btn-sm', type: 'button', onclick: async () => { if (await editRappel(null, null, actifs)) refresh(); } }, icon('bell'), 'Planifier un rappel'));
  }

  // ---------- Chiffres clés ----------
  const count = (s) => biens.filter((b) => (b.statut || 'disponible') === s).length;
  const stat = (value, label, href, cls) => h('a', { class: 'stat ' + cls, href }, h('span', { class: 'stat-value' }, String(value)), h('span', { class: 'stat-label' }, label));

  // ---------- À traiter ----------
  const todo = [];
  for (const e of events.filter(enRetard)) {
    todo.push({ when: e.date, icon: e.type === 'visite' ? 'calendar' : 'bell', cls: 'ev-statut',
      title: e.type === 'visite' ? `Compte rendu de visite — ${e.acquereurNom || 'visiteur'}` : `${eventTitle(e)} (en retard)`,
      sub: [byId[e.bienId] ? byId[e.bienId].titre : '', fmtDate(e.date)].filter(Boolean).join(' · '),
      go: () => openEv(e) });
  }
  for (const e of events.filter((x) => x.type === 'offre' && x.statut === 'attente')) {
    todo.push({ when: e.date, icon: 'euro', cls: 'ev-offre',
      title: `Offre de ${fmtPrice(e.montant)} à traiter`,
      sub: [byId[e.bienId] ? byId[e.bienId].titre : '', e.acquereurNom].filter(Boolean).join(' · '),
      go: () => { if (byId[e.bienId]) location.hash = `#/bien/${encodeURIComponent(e.bienId)}`; } });
  }
  for (const b of actifs.filter((x) => x.finMandat && new Date(x.finMandat).getTime() - now < 30 * DAY)) {
    const days = Math.ceil((new Date(b.finMandat).getTime() - now) / DAY);
    todo.push({ when: b.finMandat, icon: 'flag', cls: 'ev-prix',
      title: days < 0 ? 'Mandat expiré' : `Mandat expire dans ${days} j`,
      sub: b.titre || 'Sans titre',
      go: () => { location.hash = `#/bien/${encodeURIComponent(b.id)}`; } });
  }
  todo.sort((a, b) => (a.when || '').localeCompare(b.when || ''));

  const todoList = h('div', { class: 'events' });
  let showAllTodo = false;
  const drawTodo = () => {
    todoList.replaceChildren(...(showAllTodo ? todo : todo.slice(0, 4)).map((t) =>
      h('button', { class: 'event', type: 'button', onclick: t.go },
        h('span', { class: 'event-icon ' + t.cls }, icon(t.icon)),
        h('span', { class: 'event-body' }, h('span', { class: 'event-title' }, t.title), h('span', { class: 'small muted' }, t.sub)))));
    if (todo.length > 4) {
      todoList.append(h('button', { class: 'btn btn-ghost btn-sm see-all', type: 'button', onclick: () => { showAllTodo = !showAllTodo; drawTodo(); } },
        showAllTodo ? 'Réduire' : `Tout voir (${todo.length})`));
    }
  };
  drawTodo();

  // ---------- Vos biens ----------
  const recents = [...actifs].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')).slice(0, 10);
  const strip = h('div', { class: 'prop-strip' },
    recents.map((b) => {
      const ph = h('span', { class: 'prop-photo' }, icon('image'));
      getCoverThumb(b).then((blob) => { if (blob) ph.replaceChildren(h('img', { src: blobUrl(blob), alt: '' })); });
      return h('a', { class: 'prop-card', href: `#/bien/${encodeURIComponent(b.id)}` },
        ph,
        h('span', { class: 'prop-body' },
          h('span', { class: 'prop-price' }, b.prix ? fmtPrice(b.prix) : 'Prix à définir'),
          h('span', { class: 'prop-place' }, [b.typeBien, b.ville].filter(Boolean).join(' · ') || b.titre || '')),
        b.statut === 'option' ? h('span', { class: 'prop-tag' }, 'Sous offre') : null);
    }),
    h('a', { class: 'prop-card prop-more', href: '#/biens' }, icon('building'), h('span', null, 'Tous les biens')));

  // ---------- Chiffres du portefeuille (repliés) ----------
  const ventes = actifs.filter((b) => b.transaction !== 'Location' && Number(b.prix));
  const valeur = ventes.reduce((s, b) => s + Number(b.prix), 0);
  const honoraires = Math.round(valeur * (Number(agence.honorairesPct) || 0) / 100);
  const yearStart = new Date(new Date().getFullYear(), 0, 1).getTime();
  const vendusAnnee = events.filter((e) => e.type === 'statut' && e.nouveau === 'vendu' && new Date(e.date).getTime() >= yearStart).length;
  const nbMatches = actifs.reduce((s, b) => s + acquereursPour(b, acqs, 80).length, 0);

  // ---------- Bouton + ----------
  const plus = () => actionSheet('Ajouter', [
    { icon: 'bell', label: 'Rappel ou rendez-vous', onClick: async () => { if (await editRappel(null, null, actifs)) refresh(); } },
    { icon: 'calendar', label: 'Visite', onClick: () => {
      if (!actifs.length) { location.hash = '#/bien/nouveau'; return; }
      actionSheet('Visite de quel bien ?', actifs.map((b) => ({ label: b.titre || 'Sans titre', onClick: async () => { if (await editVisite(b)) refresh(); } })));
    } },
    { icon: 'building', label: 'Nouveau bien', onClick: () => { location.hash = '#/bien/nouveau'; } },
    { icon: 'user', label: 'Nouvel acquéreur', onClick: () => { location.hash = '#/acquereur/nouveau'; } },
  ]);

  view.append(h('div', { class: 'dash' },
    h('div', { class: 'dash-hero' },
      h('div', { class: 'dash-date' }, new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).replace(/^./, (c) => c.toUpperCase())),
      h('h2', { class: 'dash-hello' }, prenom ? `${bonjour()} ${prenom}` : bonjour())),
    upcoming,
    h('div', { class: 'stats' },
      stat(count('disponible'), 'Disponibles', '#/biens', 's-blue'),
      stat(count('option'), 'Sous offre', '#/biens', 's-terra'),
      stat(acqs.filter((a) => a.statut !== 'inactif').length, 'Acquéreurs', '#/acquereurs', 's-gold')),
    banner,
    todo.length ? h('section', { class: 'dash-block' },
      h('h3', { class: 'dash-title' }, 'À traiter ', h('span', { class: 'count-pill' }, String(todo.length))),
      h('div', { class: 'dash-card' }, todoList)) : null,
    h('section', { class: 'dash-block' },
      h('div', { class: 'dash-title-row' }, h('h3', { class: 'dash-title' }, 'Vos biens'), h('a', { class: 'small link-more', href: '#/biens' }, 'Tout voir')),
      recents.length ? strip : h('div', { class: 'dash-card empty-small' },
        h('p', { class: 'muted' }, 'Ajoutez votre premier bien pour le voir ici.'),
        h('a', { class: 'btn btn-primary btn-sm', href: '#/bien/nouveau' }, icon('plus'), 'Ajouter un bien'))),
    h('details', { class: 'dash-block dash-figures' },
      h('summary', { class: 'dash-title' }, 'Chiffres du portefeuille'),
      h('div', { class: 'dash-card figures' },
        h('div', null, h('div', { class: 'summary-label' }, 'Valeur (ventes)'), h('div', { class: 'fig-value' }, fmtPrice(valeur) || '0 €'), h('div', { class: 'small muted' }, `${ventes.length} bien${ventes.length > 1 ? 's' : ''}`)),
        h('div', null, h('div', { class: 'summary-label' }, 'Honoraires prévus'), h('div', { class: 'fig-value gold' }, fmtPrice(honoraires) || '0 €'), h('div', { class: 'small muted' }, `à ${fmtNum(agence.honorairesPct)} %`)),
        h('div', null, h('div', { class: 'summary-label' }, `Vendus en ${new Date().getFullYear()}`), h('div', { class: 'fig-value' }, String(vendusAnnee))),
        h('div', null, h('div', { class: 'summary-label' }, 'Rapprochements'), h('div', { class: 'fig-value' }, String(nbMatches)), h('div', { class: 'small muted' }, 'à plus de 80 %')))),
    h('button', { class: 'fab fab-round', type: 'button', 'aria-label': 'Ajouter', onclick: plus }, icon('plus'))));
}
