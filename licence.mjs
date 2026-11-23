// GMI - Suivi des licences DIRECTEUR.xlsm  (Netlify Function + Netlify Blobs)
// POST  {machine, poste, statut, reste, expire, licence, version}  -> rapport du logiciel
// GET   (en-tête x-admin-key)                                      -> liste pour le tableau de bord
// POST  {action:"revoquer"|"retablir", machine} (x-admin-key)      -> suspendre / rétablir une licence
import { getStore } from "@netlify/blobs";

const json = (o, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const clean = (v, n) => String(v ?? "").replace(/[^\p{L}\p{N} ._\-:]/gu, "").slice(0, n);
const STATUTS = ["ESSAI", "ACTIVE", "EXPIREE", "REVOQUEE"];
const isAdmin = (req) => {
  const k = Netlify.env.get("ADMIN_KEY");
  return !!k && req.headers.get("x-admin-key") === k;
};

export default async (req) => {
  const store = getStore("licences");

  if (req.method === "GET") {
    if (!isAdmin(req)) return json({ error: "auth" }, 401);
    const { blobs } = await store.list();
    const recs = await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" })));
    return json(recs.filter(Boolean));
  }

  if (req.method === "POST") {
    let b;
    try { b = await req.json(); } catch { return json({ error: "json" }, 400); }

    if (b.action) {
      if (!isAdmin(req)) return json({ error: "auth" }, 401);
      const rec = await store.get(String(b.machine), { type: "json" });
      if (!rec) return json({ error: "inconnu" }, 404);
      rec.revoque = b.action === "revoquer";
      await store.setJSON(rec.machine, rec);
      return json({ ok: "1" });
    }

    const m = String(b.machine || "").toUpperCase();
    if (!/^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/.test(m)) return json({ error: "machine" }, 400);
    const now = new Date().toISOString();
    const old = (await store.get(m, { type: "json" })) || { premiere_vue: now, revoque: false, nb_rapports: 0 };
    const rec = {
      ...old,
      machine: m,
      poste: clean(b.poste, 40),
      statut: STATUTS.includes(b.statut) ? b.statut : "ESSAI",
      reste: Number(b.reste) || 0,
      expire: clean(b.expire, 10),
      licence: clean(b.licence, 8),
      version: clean(b.version, 10),
      derniere_vue: now,
      nb_rapports: (old.nb_rapports || 0) + 1,
    };
    await store.setJSON(m, rec);
    return json({ ok: "1", revoque: rec.revoque ? "1" : "0" });
  }
  return json({ error: "method" }, 405);
};
