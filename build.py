#!/usr/bin/env python3
"""Genera index.html (página única, lista para GitHub Pages) juntando
src/engine.js, src/mission.js y src/calcs.js dentro de src/template.html."""
import pathlib
root = pathlib.Path(__file__).parent
engine = (root / "src" / "engine.js").read_text(encoding="utf-8")
tpl = (root / "src" / "template.html").read_text(encoding="utf-8")
assert "/*ENGINE*/" in tpl, "falta el marcador /*ENGINE*/ en la plantilla"
mission = (root / "src" / "mission.js").read_text(encoding="utf-8")
assert "/*MISSION*/" in tpl, "falta el marcador /*MISSION*/ en la plantilla"
calcs = (root / "src" / "calcs.js").read_text(encoding="utf-8")
assert "/*CALCS*/" in tpl, "falta el marcador /*CALCS*/ en la plantilla"
(root / "index.html").write_text(tpl.replace("/*ENGINE*/", engine).replace("/*MISSION*/", mission).replace("/*CALCS*/", calcs), encoding="utf-8")
print("index.html generado")
