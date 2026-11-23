#!/usr/bin/env python3
"""GMI - Générateur de clés d'activation pour DIRECTEUR.xlsm  (À GARDER PRIVÉ)

Usage :
  python3 gmi_keygen.py XXXX-XXXX-XXXX 2027-12-31          -> licence annuelle jusqu'au 31/12/2027
  python3 gmi_keygen.py XXXX-XXXX-XXXX permanente          -> licence permanente
  python3 gmi_keygen.py --verifier CLE XXXX-XXXX-XXXX      -> vérifier une clé
XXXX-XXXX-XXXX = identifiant machine affiché par le logiciel (envoyé par le client).
"""
import sys, csv, hashlib, os, datetime
SECRET = "1352338c482f47324b639d61071cd9d6a34d716a"          # doit être identique à celui du logiciel
JOURNAL = os.path.join(os.path.dirname(os.path.abspath(__file__)), "licences_emises.csv")

def signature(machine, p1, p2):
    m = machine.replace("-", "").upper()
    return hashlib.sha256(f"{SECRET}:{m}:{p1}:{p2}".encode()).hexdigest()[:16].upper()

def numero_suivant():
    if not os.path.exists(JOURNAL): return 1
    with open(JOURNAL, newline="", encoding="utf-8") as f:
        rows = list(csv.reader(f))
    return (max([int(r[0]) for r in rows if r and r[0].isdigit()] or [0])) + 1

def generer(machine, expiration):
    if expiration.lower().startswith("perm"):
        plan, d = "P", datetime.date(2099, 12, 31)
    else:
        plan, d = "A", datetime.date.fromisoformat(expiration)
    n = numero_suivant()
    p1 = f"{plan}{d:%y%m%d}"; p2 = f"{n:04d}"
    sig = signature(machine, p1, p2)
    cle = f"GMI-{p1}-{p2}-{sig[:8]}-{sig[8:]}"
    with open(JOURNAL, "a", newline="", encoding="utf-8") as f:
        csv.writer(f).writerow([n, machine.upper(), plan, d.isoformat(), cle, datetime.date.today().isoformat()])
    return cle

def verifier(cle, machine):
    p = cle.upper().replace(" ", "").split("-")
    if len(p) != 5 or p[0] != "GMI": return False
    return p[3] + p[4] == signature(machine, p[1], p[2])

if __name__ == "__main__":
    a = sys.argv[1:]
    if len(a) == 3 and a[0] == "--verifier":
        print("Clé VALIDE pour cette machine" if verifier(a[1], a[2]) else "Clé INVALIDE"); sys.exit()
    if len(a) != 2: print(__doc__); sys.exit(1)
    print("\nCLÉ D'ACTIVATION :", generer(a[0], a[1]), "\n(enregistrée dans licences_emises.csv)")
