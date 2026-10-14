/**
 * Modifica SOLO el launcher del asistente y su ubicacion en los layouts.
 * Preserva el resto de FloatingAssistant y las mejoras recientes de Admin/Sucursal.
 * Uso: node scripts/patch-robot-gdpsoft.mjs [--apply]
 */
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const APPLY=process.argv.includes('--apply');
const files={bot:join(root,'components/FloatingAssistant.jsx'),admin:join(root,'app/admin/layout.jsx'),sucursal:join(root,'app/sucursal/layout.jsx')};
const trigger=`      {!open && (
        <div className="flex justify-end px-5 pb-7 pt-2 sm:px-8" data-gdp-bot-dock>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Abrir asistente GDPSoft"
            title="Abrir asistente"
            className="group relative h-[72px] w-[72px] rounded-full border border-[#ead8ef] bg-white shadow-lg transition-transform duration-200 hover:scale-105 focus:outline-none focus:ring-4 focus:ring-[#8f2a85]/25 sm:h-[84px] sm:w-[84px]"
          >
            <Image
              src="/images/bot-gdpsoft.png"
              alt=""
              fill
              className="object-contain p-1.5"
              sizes="(max-width: 640px) 72px, 84px"
            />
            <span className="absolute -right-0.5 top-1 h-3 w-3 rounded-full border-2 border-white bg-[#93c01f]" />
          </button>
        </div>
      )}`;
function fixBot(src){
 if(src.includes('data-gdp-bot-dock'))return {content:src,changed:false};
 const at=src.indexOf('      {!open && (\n        <div className="fixed bottom-3 right-3');
 if(at<0)throw Error('No encuentro la barra verde en FloatingAssistant.jsx. No se modifica.');
 const until=src.indexOf('      )}',at);
 if(until<0)throw Error('No se puede delimitar el launcher del asistente.');
 return {content:src.slice(0,at)+trigger+src.slice(until+'      )}'.length),changed:true};
}
function fixAdmin(src){
 if(src.includes('<main') && /<\/main>\s*<FloatingAssistant \/>\s*<\/div>/.test(src))return {content:src,changed:false};
 const next=src.replace(/(<\/main>)\s*<\/div>\s*<FloatingAssistant\s*\/>/,'$1\n        <FloatingAssistant />\n      </div>');
 if(next===src)throw Error('No encuentro el layout admin esperado. No se modifica.');
 return {content:next,changed:true};
}
function fixSucursal(src){
 if(/<\/main>\s*<FloatingAssistant \/>\s*<\/div>/.test(src))return {content:src,changed:false};
 const next=src.replace(/(<\/main>)\s*<\/div>\s*<BranchNotices\s*\/>(\s*)<FloatingAssistant\s*\/>/,'$1\n        <FloatingAssistant />\n      </div>\n      <BranchNotices />');
 if(next===src)throw Error('No encuentro el layout sucursal esperado. No se modifica.');
 return {content:next,changed:true};
}
const plan=[];for(const [key,transform] of [['bot',fixBot],['admin',fixAdmin],['sucursal',fixSucursal]]){
 const pathname=files[key];if(!existsSync(pathname))throw Error('Falta '+pathname);
 const initial=readFileSync(pathname,'utf8');const result=transform(initial);plan.push({pathname,initial,...result});
}
for(const item of plan)console.log((item.changed?'CAMBIAR ':'SIN CAMBIOS ')+item.pathname);
if(!APPLY){console.log('Vista previa. Para aplicar: node scripts/patch-robot-gdpsoft.mjs --apply');process.exit(0);}
const backupDir=resolve(root,'..','GDPSoft_BACKUP_ROBOT');
mkdirSync(backupDir,{recursive:true});
for(const item of plan){if(!item.changed)continue;const rel=item.pathname.slice(root.length+1).replace(/[\\/]/g,'__');writeFileSync(join(backupDir,rel),item.initial);writeFileSync(item.pathname,item.content);}
console.log('Robot instalado: al final de cada pagina, sin barra flotante cuando esta cerrado.');
