// Récupération d'un contact du téléphone :
// - Android (Chrome) : sélecteur de contacts du système (Contact Picker API) ;
// - partout : import d'une fiche contact .vcf (sur iPhone : Contacts > Partager le contact > Enregistrer dans Fichiers).

export const canPickContacts = () => 'contacts' in navigator && 'ContactsManager' in window;

/** Sépare « Jean-Pierre Dupont » en prénom / nom. */
function splitName(full) {
  const parts = String(full || '').trim().split(/\s+/);
  if (parts.length < 2) return { prenom: '', nom: parts[0] || '' };
  return { prenom: parts[0], nom: parts.slice(1).join(' ') };
}

/** Ouvre le répertoire (Android). Retourne { prenom, nom, telephone, email } ou null. */
export async function pickContact() {
  const props = ['name', 'tel', 'email'];
  const supported = navigator.contacts.getProperties ? await navigator.contacts.getProperties() : props;
  const [c] = await navigator.contacts.select(props.filter((p) => supported.includes(p)), { multiple: false });
  if (!c) return null;
  return {
    ...splitName((c.name || [])[0]),
    telephone: (c.tel || [])[0] || '',
    email: (c.email || [])[0] || '',
  };
}

// ---------- Fiche contact vCard (.vcf) ----------

const unescapeV = (s) => s.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim();

function decodeQuotedPrintable(s) {
  const bytes = [];
  const str = s.replace(/=\r?\n/g, '');
  for (let i = 0; i < str.length; i++) {
    if (str[i] === '=' && /^[0-9A-F]{2}$/i.test(str.substr(i + 1, 2))) { bytes.push(parseInt(str.substr(i + 1, 2), 16)); i += 2; }
    else bytes.push(str.charCodeAt(i));
  }
  try { return new TextDecoder('utf-8').decode(new Uint8Array(bytes)); } catch (e) { return s; }
}

/** Lit la première fiche d'un fichier .vcf. */
export function parseVcard(text) {
  // Lignes repliées : une ligne qui commence par un espace continue la précédente.
  const lines = text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  const out = { prenom: '', nom: '', telephone: '', email: '', fn: '' };
  let inCard = false;
  let telPref = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (/^BEGIN:VCARD/i.test(line)) { if (inCard) break; inCard = true; continue; }
    if (/^END:VCARD/i.test(line)) break;
    if (!inCard) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const head = line.slice(0, idx);
    let value = line.slice(idx + 1);
    const [nameWithGroup, ...params] = head.split(';');
    const name = nameWithGroup.replace(/^item\d+\./i, '').toUpperCase();
    if (params.some((p) => /ENCODING=QUOTED-PRINTABLE/i.test(p))) value = decodeQuotedPrintable(value);
    if (name === 'N') {
      const [last, first] = value.replace(/\\;/g, '\u0000').split(';').map((s) => s.replace(/\u0000/g, '\\;'));
      out.nom = unescapeV(last || '');
      out.prenom = unescapeV(first || '');
    } else if (name === 'FN') {
      out.fn = unescapeV(value);
    } else if (name === 'TEL') {
      const pref = params.some((p) => /PREF|CELL|MOBILE|iPhone/i.test(p));
      if (!out.telephone || (pref && !telPref)) { out.telephone = unescapeV(value).replace(/^tel:/i, ''); telPref = pref; }
    } else if (name === 'EMAIL' && !out.email) {
      out.email = unescapeV(value);
    }
  }
  if (!out.nom && !out.prenom && out.fn) Object.assign(out, splitName(out.fn));
  delete out.fn;
  return out.nom || out.prenom || out.telephone || out.email ? out : null;
}
