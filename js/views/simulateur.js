// Simulateur : honoraires, prix net vendeur, frais de notaire, crédit.
// Les montants calculés (honoraires, frais de notaire, emprunt) peuvent être saisis à la main
// en cas d'arrangement entre les parties ; « ↺ » revient au calcul automatique.
import { h, icon, toast, fmtPrice, fmtNum } from '../ui.js';
import { getBien, listBiens } from '../db.js';
import { getAgence } from '../agence.js';
import { setTopbar } from '../app.js';

const parse = (v) => {
  const n = Number(String(v ?? '').replace(/\s/g, '').replace(',', '.').replace('€', '').replace('%', ''));
  return Number.isFinite(n) ? n : 0;
};
const round = (v) => Math.round(v);
const fmtIn = (v) => fmtNum(Math.round(v * 100) / 100);

export async function renderSimulateur(view, bienId) {
  const agence = await getAgence();
  const bien = bienId ? await getBien(bienId) : null;
  const biens = (await listBiens()).filter((b) => b.prix && b.transaction !== 'Location')
    .sort((a, b) => (a.titre || '').localeCompare(b.titre || '', 'fr'));

  setTopbar({ title: 'Simulateur', back: bien ? `#/bien/${encodeURIComponent(bien.id)}` : null });

  // Valeurs saisies
  const state = {
    prix: bien && bien.prix ? Number(bien.prix) : 300000,
    honorairesPct: agence.honorairesPct,
    charge: agence.honorairesCharge,
    neuf: 'ancien',
    notairePct: agence.notairePctAncien,
    apport: 0,
    taux: 3.5,
    duree: 20,
    assurance: 0.3,
  };
  // Montants saisis à la main (null = calcul automatique)
  const manual = { honoraires: null, notaire: null, emprunt: null };

  // ---------- Champs ----------
  const inputs = {};
  const numberInput = (key, unit, { manualKey = null } = {}) => {
    const el = h('input', { class: 'input', inputmode: 'decimal', value: manualKey ? '' : fmtIn(state[key]) });
    inputs[key] = el;
    el.addEventListener('input', () => {
      if (manualKey) manual[manualKey] = el.value.trim() === '' ? null : parse(el.value);
      else state[key] = parse(el.value);
      compute();
    });
    const wrap = h('div', { class: 'input-unit' + (manualKey ? ' with-reset' : '') }, el, h('span', { class: 'unit' }, unit));
    if (manualKey) {
      wrap.append(h('button', {
        class: 'reset-btn', type: 'button', title: 'Revenir au calcul automatique', 'aria-label': 'Recalculer',
        onclick: () => { manual[manualKey] = null; el.value = ''; compute(); },
      }, '↺'));
    }
    return wrap;
  };
  const select = (key, options, onChange) => {
    const el = h('select', { class: 'input', value: state[key] }, options.map(([v, l]) => h('option', { value: v }, l)));
    el.addEventListener('change', () => { state[key] = el.value; onChange && onChange(); compute(); });
    inputs[key] = el;
    return el;
  };
  const field = (label, control, help) => h('div', { class: 'field' }, h('label', null, label), control, help ? h('p', { class: 'small muted field-help' }, help) : null);

  const out = {};
  const row = (key, label, strong) => {
    out[key] = h('span', { class: strong ? 'res-strong' : 'res-value' });
    return h('div', { class: 'res-row' + (strong ? ' res-total' : '') }, h('span', { class: 'res-label' }, label), out[key]);
  };
  const tags = {};
  const tag = (key) => { tags[key] = h('span', { class: 'badge badge-orange manual-tag', hidden: true }, 'saisi à la main'); return tags[key]; };

  // Choix d'un bien du portefeuille
  const picker = biens.length ? h('select', {
    class: 'input', value: bien ? bien.id : '',
    onchange: (e) => { location.hash = e.target.value ? `#/simulateur/${encodeURIComponent(e.target.value)}` : '#/simulateur'; },
  }, h('option', { value: '' }, 'Saisie libre'), biens.map((b) => h('option', { value: b.id }, `${b.titre || 'Sans titre'} — ${fmtPrice(b.prix)}`))) : null;

  view.append(h('div', { class: 'simu' },
    picker ? h('section', { class: 'section' }, h('div', { class: 'section-head' }, h('h3', null, 'Bien')), picker) : null,

    h('section', { class: 'section' },
      h('div', { class: 'section-head' }, h('h3', null, 'Vente')),
      h('div', { class: 'form-grid' },
        field('Prix de vente affiché', numberInput('prix', '€')),
        field('Honoraires', numberInput('honorairesPct', '% TTC')),
        field('À la charge de', select('charge', [['acquereur', "l'acquéreur"], ['vendeur', 'du vendeur']])),
        field(h('span', null, 'Montant des honoraires ', tag('honoraires')), numberInput('honorairesManual', '€', { manualKey: 'honoraires' }), 'Laisser vide pour le calcul automatique.'),
        field('Type de bien', select('neuf', [['ancien', 'Ancien'], ['neuf', 'Neuf (VEFA)']], () => {
          state.notairePct = state.neuf === 'neuf' ? agence.notairePctNeuf : agence.notairePctAncien;
          inputs.notairePct.value = fmtIn(state.notairePct);
        })),
        field('Frais de notaire', numberInput('notairePct', '%')),
        field(h('span', null, 'Montant frais de notaire ', tag('notaire')), numberInput('notaireManual', '€', { manualKey: 'notaire' }), 'Estimation ; laisser vide pour le calcul automatique.')),
      h('div', { class: 'results' },
        row('honoraires', 'Honoraires d’agence TTC'),
        row('honorairesInfo', ''),
        row('net', 'Prix net vendeur', true),
        row('notaire', 'Frais de notaire estimés'),
        row('total', 'Coût total pour l’acquéreur', true))),

    h('section', { class: 'section' },
      h('div', { class: 'section-head' }, h('h3', null, 'Financement')),
      h('div', { class: 'form-grid' },
        field('Apport personnel', numberInput('apport', '€')),
        field(h('span', null, 'Montant emprunté ', tag('emprunt')), numberInput('empruntManual', '€', { manualKey: 'emprunt' }), 'Par défaut : coût total moins l’apport.'),
        field('Taux du crédit', numberInput('taux', '%')),
        field('Durée', select('duree', [10, 15, 20, 25].map((d) => [String(d), `${d} ans`]))),
        field('Assurance emprunteur', numberInput('assurance', '% / an'))),
      h('div', { class: 'results' },
        row('emprunt', 'Montant emprunté'),
        row('mensualite', 'Mensualité (hors assurance)'),
        row('assuranceM', 'Assurance par mois'),
        row('mensualiteTotale', 'Mensualité totale', true),
        row('interets', 'Coût total du crédit (intérêts + assurance)'),
        row('revenus', 'Revenus nets mensuels conseillés (35 %)'))),

    h('div', { class: 'btn-row simu-actions' },
      h('button', { class: 'btn', type: 'button', onclick: copySummary }, icon('copy'), 'Copier le récapitulatif')),
    h('p', { class: 'small muted meta' }, 'Estimations indicatives, hors frais de garantie et de dossier bancaire. Valeurs par défaut modifiables dans Réglages.')));

  inputs.duree.value = String(state.duree);
  let last = {};

  function compute() {
    const prix = state.prix;
    const autoH = prix * state.honorairesPct / 100;
    const H = manual.honoraires ?? autoH;
    const net = prix - H;
    // Honoraires à la charge de l'acquéreur : les frais de notaire portent sur le prix hors honoraires.
    const baseNotaire = state.charge === 'acquereur' ? net : prix;
    const notaire = manual.notaire ?? baseNotaire * state.notairePct / 100;
    const total = prix + notaire;
    const autoEmprunt = Math.max(0, total - state.apport);
    const emprunt = manual.emprunt ?? autoEmprunt;
    const n = Number(state.duree) * 12;
    const r = state.taux / 100 / 12;
    const mensualite = n ? (r ? emprunt * r / (1 - Math.pow(1 + r, -n)) : emprunt / n) : 0;
    const assuranceM = emprunt * state.assurance / 100 / 12;
    const mensualiteTotale = mensualite + assuranceM;
    const interets = mensualiteTotale * n - emprunt;

    // Champs « montant » : affiche le calcul auto en indication
    inputs.honorairesManual.placeholder = fmtIn(round(autoH));
    inputs.notaireManual.placeholder = fmtIn(round(baseNotaire * state.notairePct / 100));
    inputs.empruntManual.placeholder = fmtIn(round(autoEmprunt));
    tags.honoraires.hidden = manual.honoraires === null;
    tags.notaire.hidden = manual.notaire === null;
    tags.emprunt.hidden = manual.emprunt === null;

    out.honoraires.textContent = fmtPrice(round(H)) + (prix ? ` (${fmtNum(Math.round(H / prix * 1000) / 10)} % du prix)` : '');
    out.honorairesInfo.textContent = state.charge === 'acquereur'
      ? `À la charge de l'acquéreur, soit ${net ? fmtNum(Math.round(H / net * 1000) / 10) : 0} % du prix hors honoraires`
      : 'À la charge du vendeur (déduits du prix de vente)';
    out.net.textContent = fmtPrice(round(net));
    out.notaire.textContent = fmtPrice(round(notaire));
    out.total.textContent = fmtPrice(round(total));
    out.emprunt.textContent = fmtPrice(round(emprunt));
    out.mensualite.textContent = fmtPrice(round(mensualite)) + ' /mois';
    out.assuranceM.textContent = fmtPrice(round(assuranceM)) + ' /mois';
    out.mensualiteTotale.textContent = fmtPrice(round(mensualiteTotale)) + ' /mois';
    out.interets.textContent = fmtPrice(round(interets));
    out.revenus.textContent = fmtPrice(round(mensualiteTotale / 0.35)) + ' /mois';
    last = { prix, H, net, notaire, total, emprunt, mensualiteTotale, interets };
  }

  async function copySummary() {
    const L = last;
    const txt = [
      bien ? `${bien.titre}${bien.reference ? ' (réf. ' + bien.reference + ')' : ''}` : 'Simulation',
      `Prix de vente : ${fmtPrice(round(L.prix))}`,
      `Honoraires TTC (${state.charge === 'acquereur' ? 'charge acquéreur' : 'charge vendeur'}) : ${fmtPrice(round(L.H))}`,
      `Prix net vendeur : ${fmtPrice(round(L.net))}`,
      `Frais de notaire estimés : ${fmtPrice(round(L.notaire))}`,
      `Coût total acquéreur : ${fmtPrice(round(L.total))}`,
      `Financement : ${fmtPrice(round(L.emprunt))} sur ${state.duree} ans à ${fmtNum(state.taux)} % → ${fmtPrice(round(L.mensualiteTotale))}/mois (assurance incluse)`,
      'Estimation indicative.',
    ].join('\n').replace(/ /g, ' ');
    try { await navigator.clipboard.writeText(txt); toast('Récapitulatif copié'); } catch (e) { toast('Copie impossible sur cet appareil'); }
  }

  compute();
}
