import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
async function walk(dir){const entries=await readdir(dir,{withFileTypes:true});let files=[];for(const e of entries){const p=join(dir,e.name);if(e.isDirectory())files.push(...await walk(p));else if(p.endsWith(".js")||p.endsWith(".mjs"))files.push(p);}return files;}
const files=[...(await walk("src")),...(await walk("tests")),...(await walk("scripts")).filter(p=>p!=="scripts/check-syntax.mjs")];
for(const file of files){const result=spawnSync(process.execPath,["--check",file],{encoding:"utf8"});if(result.status!==0){process.stderr.write(result.stderr);process.exit(result.status??1);} }
console.log(`Syntax OK: ${files.length} fichiers JavaScript vérifiés.`);