// Tableau de bord : chiffres du portefeuille, agenda, offres, mandats, activité récente.
import { h, icon, fmtPrice, fmtDate, fmtDateTime } from '../ui.js';
import { listBiens, listEvents, listAcquereurs } from '../db.js';
import { setTopbar } from '../app.js';
import { getAgence } from '../agence.js';
import { backupReminder } from '../backup.js';
import { eventRow } from './journal.js';
import { acquereursPour } from '../matching.js';

const DAY = 86400e3;

export async function renderDashboard(view) {
  setTopbar({ title: "Port'Immo" });
  const [biens, events, acqs, agence, banner] = await Promise.all([listBiens(), listEvents(), listAcquereurs(), getAgence(), backupReminder()]);
  const byId = Object.fromEntries(biens.map((b) => [b.id, b]));
  const now = Date.now();
  const go = (bienId) => () => { location.hash = `#/bien/${encodeURIComponent(bienId)}`; };

  // ---------- Chiffres ----------
  const count = (s) => biens.filter((b) => (b.statut || 'disponible') === s).length;
  const actifs = biens.filter((b) => b.statut !== 'vendu' && b.statut !== 'archive');
  const ventesActives = actifs.filter((b) => b.transaction !== 'Location' && Number(b.prix));
  const valeur = ventesActives.reduce((s, b) => s + Number(b.prix), 0);
  const honoraires = valeur * (Number(agence.honorairesPct) || 0) / 100;
  const yearStart = new Date(new Date().getFullYear(), 0, 1).getTime();
  const vendusAnnee = events.filter((e) => e.type === 'statut' && e.nouveau === 'vendu' && new Date(e.date).getTime() >= yearStart).length;

  const tile = (value, label, href, cls = '') => h('a', { class: 'tile ' + cls, href }, h('span', { class: 'tile-value' }, value), h('span', { class: 'tile-label' }, label));

  // ---------- Listes ----------
  const visites = events.filter((e) => e.type === 'visite' && e.statut === 'prevue');
  const aVenir = visites.filter((e) => new Date(e.date).getTime() >= now - 2 * 3600e3).sort((a, b) => a.date.localeCompare(b.date));
  const aCompleter = visites.filter((e) => new Date(e.date).getTime() < now - 2 * 3600e3);
  const offres = events.filter((e) => e.type === 'offre' && e.statut === 'attente').sort((a, b) => Number(b.montant) - Number(a.montant));
  const mandats = actifs
    .filter((b) => b.finMandat && new Date(b.finMandat).getTime() - now < 30 * DAY)
    .sort((a, b) => a.finMandat.localeCompare(b.finMandat));
  const recent = events.filter((e) => new Date(e.date).getTime() <= now).slice(0, 6);
  const nbMatches = actifs.reduce((s, b) => s + acquereursPour(b, acqs, 80).length, 0);

  const block = (title, iconName, items, empty, extra = null) => h('section', { class: 'section' },
    h('div', { class: 'section-head' }, h('h3', { class: 'with-icon' }, icon(iconName), title), extra),
    items.length ? h('div', { class: 'events' }, items) : h('p', { class: 'muted small' }, empty));

  const titreBien = (e) => (byId[e.bienId] ? byId[e.bienId].titre || 'Sans titre' : 'Bien supprimé');

  view.append(h('div', { class: 'dashboard' },
    banner,
    h('div', { class: 'quick-adds dash-actions' },
      h('a', { class: 'quick-add', href: '#/bien/nouveau' }, icon('plus'), h('span', null, 'Bien')),
      h('a', { class: 'quick-add', href: '#/acquereur/nouveau' }, icon('user'), h('span', null, 'Acquéreur')),
      h('a', { class: 'quick-add', href: '#/carte' }, icon('map'), h('span', null, 'Carte')),
      h('a', { class: 'quick-add', href: '#/simulateur' }, icon('calculator'), h('span', null, 'Simulateur'))),

    h('div', { class: 'tiles' },
      tile(String(count('disponible')), 'Disponibles', '#/biens', 't-green'),
      tile(String(count('option')), 'Sous offre', '#/biens', 't-orange'),
      tile(String(vendusAnnee), `Vendus / loués en ${new Date().getFullYear()}`, '#/biens', 't-blue'),
      tile(String(acqs.filter((a) => a.statut !== 'inactif').length), 'Acquéreurs actifs', '#/acquereurs', 't-grey')),

    h('section', { class: 'section money' },
      h('div', { class: 'money-row' },
        h('div', null, h('div', { class: 'summary-label' }, 'Valeur du portefeuille (ventes)'), h('div', { class: 'money-value' }, fmtPrice(valeur) || '0 €'),
          h('div', { class: 'small muted' }, `${ventesActives.length} bien${ventesActives.length > 1 ? 's' : ''} à la vente`)),
        h('div', null, h('div', { class: 'summary-label' }, 'Honoraires prévisionnels'), h('div', { class: 'money-value accent' }, fmtPrice(Math.round(honoraires)) || '0 €'),
          h('div', { class: 'small muted' }, `au taux par défaut de ${String(agence.honorairesPct).replace('.', ',')} %`))),
      nbMatches ? h('a', { class: 'match-hint', href: '#/acquereurs' }, icon('users'), `${nbMatches} rapprochement${nbMatches > 1 ? 's' : ''} bien ↔ acquéreur à plus de 80 %`) : null),

    aCompleter.length ? block('Visites à compléter', 'alert',
      aCompleter.map((e) => eventRow(e, go(e.bienId), { showBien: titreBien(e) })), '') : null,

    block('Prochaines visites', 'calendar',
      aVenir.slice(0, 8).map((e) => eventRow(e, go(e.bienId), { showBien: titreBien(e) })),
      'Aucune visite prévue. Ajoutez-en depuis le journal d’un bien.'),

    block('Offres en attente', 'euro',
      offres.map((e) => eventRow(e, go(e.bienId), { showBien: titreBien(e) })),
      'Aucune offre en attente.'),

    block('Mandats à renouveler', 'flag',
      mandats.map((b) => {
        const days = Math.ceil((new Date(b.finMandat).getTime() - now) / DAY);
        return h('button', { class: 'event', type: 'button', onclick: go(b.id) },
          h('span', { class: 'event-icon ev-statut' }, icon('flag')),
          h('span', { class: 'event-body' },
            h('span', { class: 'event-top' }, h('span', { class: 'event-title' }, b.titre || 'Sans titre'),
              h('span', { class: 'badge ' + (days < 0 ? 'badge-grey' : days <= 7 ? 'badge-orange' : 'badge-blue') }, days < 0 ? 'Expiré' : `${days} j`)),
            h('span', { class: 'event-date muted' }, `Fin du mandat ${b.mandat ? (b.mandat.toLowerCase() + ' ') : ''}le ${fmtDate(b.finMandat)}`)));
      }),
      'Aucun mandat n’arrive à échéance dans les 30 jours. (Renseignez « Fin du mandat » dans la fiche des biens.)'),

    block('Activité récente', 'list',
      recent.map((e) => eventRow(e, go(e.bienId), { showBien: titreBien(e) })),
      'Aucune activité pour le moment.'),

    h('p', { class: 'muted small meta' }, `Mis à jour le ${fmtDateTime(new Date().toISOString())}`)));
}
