// Documents d'un bien : diagnostics, DPE, métré, titre de propriété, plans…
import { h, fill, icon, toast, actionSheet, confirmDialog, fmtDate, pickFiles, shareOrDownload } from '../ui.js';
import { listDocs, saveDoc, deleteDoc, saveEvent } from '../db.js';
import { formDialog } from '../dialogs.js';

export const DOC_CATEGORIES = [
  'Diagnostics', 'DPE', 'Métré / superficie', 'Titre de propriété', 'Mandat',
  'Plan', 'Taxe foncière', 'Copropriété', 'Compromis / promesse', 'Autre',
];

const fmtSize = (b) => (b > 1e6 ? (b / 1e6).toFixed(1) + ' Mo' : Math.max(1, Math.round(b / 1e3)) + ' ko');
const baseName = (n) => n.replace(/\.[a-z0-9]{2,5}$/i, '');

export async function renderDocs(section, ctx) {
  async function add() {
    const files = await pickFiles({ accept: 'application/pdf,image/*', multiple: true });
    if (!files.length) return;
    let meta = { categorie: 'Autre' };
    if (files.length === 1) {
      meta = await formDialog('Nouveau document', [
        { key: 'nom', label: 'Nom', required: true },
        { key: 'categorie', label: 'Catégorie', type: 'select', options: DOC_CATEGORIES },
      ], { nom: baseName(files[0].name), categorie: guessCategory(files[0].name) }, { okLabel: 'Ajouter' });
      if (!meta) return;
    }
    const bien = ctx.getBien();
    for (const f of files) {
      if (f.size > 25e6) { toast(`« ${f.name} » est trop lourd (25 Mo max)`); continue; }
      const nom = files.length === 1 ? meta.nom : baseName(f.name);
      await saveDoc({ bienId: bien.id, nom, categorie: files.length === 1 ? meta.categorie : guessCategory(f.name), fileName: f.name, size: f.size, blob: f });
      await saveEvent({ type: 'document', bienId: bien.id, nom });
    }
    toast(files.length > 1 ? `${files.length} documents ajoutés` : 'Document ajouté');
    await draw();
    ctx.onChange && ctx.onChange();
  }

  function open(doc) {
    const url = URL.createObjectURL(doc.blob);
    const w = window.open(url, '_blank');
    if (!w) shareOrDownload(new File([doc.blob], doc.fileName || doc.nom, { type: doc.blob.type }));
    setTimeout(() => URL.revokeObjectURL(url), 120000);
  }

  function menu(doc) {
    actionSheet(doc.nom, [
      { icon: 'eye', label: 'Ouvrir', onClick: () => open(doc) },
      { icon: 'share', label: 'Partager / enregistrer', onClick: () => shareOrDownload(new File([doc.blob], doc.fileName || doc.nom, { type: doc.blob.type }), { title: doc.nom }) },
      { icon: 'rename', label: 'Renommer / catégorie', onClick: async () => {
        const v = await formDialog('Modifier le document', [
          { key: 'nom', label: 'Nom', required: true },
          { key: 'categorie', label: 'Catégorie', type: 'select', options: DOC_CATEGORIES },
        ], doc);
        if (v) { await saveDoc({ ...doc, ...v }); draw(); }
      } },
      { icon: 'trash', label: 'Supprimer', danger: true, onClick: async () => {
        if (await confirmDialog(`Supprimer « ${doc.nom} » ? Cette action est définitive.`, { okLabel: 'Supprimer', danger: true })) {
          await deleteDoc(doc.id);
          draw();
        }
      } },
    ]);
  }

  async function draw() {
    const docs = await listDocs(ctx.getBien().id);
    fill(section,
      h('div', { class: 'section-head' },
        h('h3', null, 'Documents'),
        h('button', { class: 'btn btn-sm', type: 'button', onclick: add }, icon('plus'), 'Ajouter')),
      docs.length
        ? h('div', { class: 'docs' }, docs.map((d) => h('button', { class: 'doc', type: 'button', onclick: () => menu(d) },
          h('span', { class: 'doc-icon' + (d.blob && d.blob.type === 'application/pdf' ? ' pdf' : '') }, icon(d.blob && d.blob.type.startsWith('image/') ? 'image' : 'file')),
          h('span', { class: 'doc-body' },
            h('span', { class: 'doc-name' }, d.nom),
            h('span', { class: 'small muted' }, [d.categorie, d.size ? fmtSize(d.size) : '', fmtDate(d.createdAt)].filter(Boolean).join(' · '))))))
        : h('p', { class: 'muted small' }, 'Diagnostics, DPE, métré, titre de propriété… Ajoutez des PDF ou des photos de documents.'));
  }

  await draw();
  return { add, refresh: draw };
}

function guessCategory(name) {
  const n = name.toLowerCase();
  if (/dpe|energ/.test(n)) return 'DPE';
  if (/diag|amiante|plomb|termite|electri|gaz/.test(n)) return 'Diagnostics';
  if (/carrez|metre|métré|superfic|surface/.test(n)) return 'Métré / superficie';
  if (/titre|acte|propri/.test(n)) return 'Titre de propriété';
  if (/mandat/.test(n)) return 'Mandat';
  if (/plan/.test(n)) return 'Plan';
  if (/fonci/.test(n)) return 'Taxe foncière';
  if (/copro|ag |pv /.test(n)) return 'Copropriété';
  if (/compromis|promesse/.test(n)) return 'Compromis / promesse';
  return 'Autre';
}
