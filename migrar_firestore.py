#!/usr/bin/env python3
"""
═══════════════════════════════════════════════════════════════
  TIPSA — Migración Firestore: Named DB → Default DB
═══════════════════════════════════════════════════════════════
  
  Este script:
  1. Lee TODOS los documentos de la base de datos named
  2. Los escribe en la base de datos (default)
  3. No borra nada de la antigua (por seguridad)
  
  Requisitos: Python 3.x (no necesita pip install nada)
  
  USO:
    python3 migrar_firestore.py
  
═══════════════════════════════════════════════════════════════
"""

import json
import urllib.request
import urllib.error
import time
import sys

# ── Configuración ──
API_KEY = "AIzaSyCSX_fZrgaZ_jVPqCEIFlA01kF_71AXT4w"
PROJECT = "gen-lang-client-0796008211"
OLD_DB = "ai-studio-d2ceb28e-2c31-4d82-a2b3-a55fbaaf3772"
NEW_DB = "(default)"

COLLECTIONS = ["centers", "contractors", "roles", "employees", "admins", "attendance"]

OLD_BASE = f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/{OLD_DB}/documents"
OLD_QUERY = f"{OLD_BASE}:runQuery?key={API_KEY}"
NEW_BASE = f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/{NEW_DB}/documents"

# ── Auth ──
def authenticate():
    """Auth anónimo con Firebase"""
    url = f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={API_KEY}"
    data = json.dumps({"returnSecureToken": True}).encode()
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    resp = urllib.request.urlopen(req)
    d = json.loads(resp.read())
    if "idToken" not in d:
        print(f"❌ Error de autenticación: {d}")
        sys.exit(1)
    print(f"✅ Autenticado (UID: {d['localId']})")
    return d["idToken"]

# ── Leer colección completa ──
def read_collection(token, db_id, collection):
    """Lee todos los docs de una colección via runQuery"""
    url = f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/{db_id}/documents:runQuery?key={API_KEY}"
    body = json.dumps({"structuredQuery": {"from": [{"collectionId": collection}], "limit": 10000}}).encode()
    req = urllib.request.Request(url, data=body, headers={
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    })
    try:
        resp = urllib.request.urlopen(req)
        results = json.loads(resp.read())
        docs = []
        for item in results:
            if "document" in item:
                doc = item["document"]
                # Extract doc ID from path
                parts = doc["name"].split("/")
                doc_id = parts[-1]
                docs.append({"id": doc_id, "fields": doc.get("fields", {})})
        return docs
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"  ❌ Error leyendo {collection}: HTTP {e.code} - {body[:200]}")
        return []

# ── Escribir documento ──
def write_document(token, collection, doc_id, fields):
    """Escribe un documento en la DB default"""
    url = f"{NEW_BASE}/{collection}/{doc_id}?key={API_KEY}"
    body = json.dumps({"fields": fields}).encode()
    req = urllib.request.Request(url, data=body, method="PATCH", headers={
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    })
    try:
        resp = urllib.request.urlopen(req)
        return True
    except urllib.error.HTTPError as e:
        error_body = e.read().decode()
        print(f"    ❌ Error escribiendo {collection}/{doc_id}: HTTP {e.code} - {error_body[:200]}")
        return False

# ── Main ──
def main():
    print("═" * 60)
    print("  TIPSA — Migración Firestore")
    print(f"  ORIGEN:  {OLD_DB}")
    print(f"  DESTINO: {NEW_DB}")
    print("═" * 60)
    print()
    
    # Verificar que el usuario quiere continuar
    print("⚠️  ANTES DE EJECUTAR:")
    print("   1. Asegúrate de haber creado la BD (default) en Firebase Console")
    print("   2. Copia las Security Rules de la BD antigua a la nueva")
    print("   3. Habilita Anonymous Auth si no lo está")
    print()
    resp = input("¿Continuar con la migración? (escribir SI): ")
    if resp.strip().upper() != "SI":
        print("Cancelado.")
        return
    
    print()
    token = authenticate()
    print()
    
    total_read = 0
    total_written = 0
    total_errors = 0
    
    for col in COLLECTIONS:
        print(f"📦 Migrando '{col}'...")
        
        # Leer de la antigua
        docs = read_collection(token, OLD_DB, col)
        total_read += len(docs)
        print(f"   Leídos: {len(docs)} documentos")
        
        if len(docs) == 0:
            print(f"   ⏩ Vacío, saltando")
            continue
        
        # Escribir en la nueva
        ok = 0
        errors = 0
        for i, doc in enumerate(docs):
            success = write_document(token, col, doc["id"], doc["fields"])
            if success:
                ok += 1
            else:
                errors += 1
            
            # Progress
            if (i + 1) % 100 == 0:
                print(f"   ... {i+1}/{len(docs)}")
            
            # Rate limit: 1 write per 20ms = 50 writes/sec (well under Firestore limit)
            time.sleep(0.02)
        
        total_written += ok
        total_errors += errors
        print(f"   ✅ Escritos: {ok} | ❌ Errores: {errors}")
        print()
        
        # Re-authenticate every 2 collections (token might expire for large datasets)
        if COLLECTIONS.index(col) % 2 == 1:
            print("   🔄 Renovando token...")
            token = authenticate()
    
    print("═" * 60)
    print(f"  MIGRACIÓN COMPLETADA")
    print(f"  Leídos:  {total_read}")
    print(f"  Escritos: {total_written}")
    print(f"  Errores:  {total_errors}")
    print("═" * 60)
    print()
    
    if total_errors == 0:
        print("✅ Todo correcto. Ahora:")
        print("   1. Verifica los datos en Firebase Console → Firestore → DB (default)")
        print("   2. Abre tipsa_marcaje_lite.html y comprueba que funciona")
        print("   3. Cuando estés seguro de que todo va bien,")
        print("      puedes borrar la BD antigua desde la consola")
    else:
        print(f"⚠️  Hubo {total_errors} errores. Revisa los mensajes de arriba.")
        print("   Puedes volver a ejecutar el script — los docs ya escritos se sobrescriben sin problema.")

if __name__ == "__main__":
    main()
