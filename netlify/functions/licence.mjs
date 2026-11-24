// DIRECTEUR - Suivi des licences (Netlify Function + Netlify Blobs)
// POST  {machine, poste, statut, reste, expire, licence, version}   -> rapport du logiciel
// GET   (en-tete x-admin-key)                                       -> liste pour le tableau de bord
// POST  {action:"revoquer"|"retablir"|"supprimer", machine}  (x-admin-key)
import { getStore } from "@netlify/blobs";
import { createHash, timingSafeEqual } from "node:crypto";

const json = (o, s = 200) =>
  new Response(JSON.stringify(o), {
    status: s,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
const clean = (v, n) => String(v ?? "").replace(/[^\p{L}\p{N} ._\-:]/gu, "").slice(0, n);
const STATUTS = ["ESSAI", "ACTIVE", "EXPIREE", "REVOQUEE"];
const ACTIONS = ["revoquer", "retablir", "supprimer"];
const MACHINE = /^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/;
const sha = (s) => createHash("sha256").update(String(s)).digest();

const isAdmin = (req) => {
  const k = Netlify.env.get("ADMIN_KEY");
  if (!k || k.length < 8) return false;
  return timingSafeEqual(sha(k), sha(req.headers.get("x-admin-key") || ""));
};
const refuse = async () => {
  await new Promise((r) => setTimeout(r, 700)); // freine les essais repetes
  return json({ error: "auth" }, 401);
};

export default async (req) => {
  try {
    const store = getStore("licences");

    if (req.method === "GET") {
      if (!isAdmin(req)) return await refuse();
      const { blobs } = await store.list();
      const recs = await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" })));
      return json(recs.filter(Boolean));
    }

    if (req.method === "POST") {
      const txt = await req.text();
      if (txt.length > 4000) return json({ error: "taille" }, 413);
      let b;
      try { b = JSON.parse(txt); } catch { return json({ error: "json" }, 400); }
      if (!b || typeof b !== "object") return json({ error: "json" }, 400);

      // --- actions d'administration ---
      if (b.action) {
        if (!isAdmin(req)) return await refuse();
        if (!ACTIONS.includes(b.action)) return json({ error: "action" }, 400);
        const m = String(b.machine || "").toUpperCase();
        if (!MACHINE.test(m)) return json({ error: "machine" }, 400);
        const rec = await store.get(m, { type: "json" });
        if (!rec) return json({ error: "inconnu" }, 404);
        if (b.action === "supprimer") {
          await store.delete(m);
        } else {
          rec.revoque = b.action === "revoquer";
          await store.setJSON(m, rec);
        }
        return json({ ok: "1" });
      }

      // --- rapport envoye par le logiciel ---
      const m = String(b.machine || "").toUpperCase();
      if (!MACHINE.test(m)) return json({ error: "machine" }, 400);
      const now = new Date().toISOString();
      const old = (await store.get(m, { type: "json" })) || { premiere_vue: now, revoque: false, nb_rapports: 0 };
      const reste = Math.min(Math.max(Number(b.reste) || 0, 0), 1e9);
      const rec = {
        ...old,
        machine: m,
        poste: clean(b.poste, 40),
        statut: STATUTS.includes(b.statut) ? b.statut : "ESSAI",
        reste,
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
  } catch (e) {
    return json({ error: "serveur" }, 500);
  }
};
