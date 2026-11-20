// Human consequences are independent from geographic geometry and political control.
const clone=v=>structuredClone(v),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function createSocietyState(regions=[]){const ids=new Set(),baseline=regions.map(r=>{if(!r?.regionId||ids.has(r.regionId))throw Error("Région sociale absente ou dupliquée.");ids.add(r.regionId);return {regionId:r.regionId,countryId:r.countryId??null,population:Math.max(0,Number(r.population??0)),displacedPopulation:0,shelteredPopulation:0,migratedOutPopulation:0,incomingMigrants:0,fatalities:0,infrastructure:clamp(Number(r.infrastructure??1),0,1),foodSecurity:clamp(Number(r.foodSecurity??1),0,1),stability:clamp(Number(r.stability??1),0,1),habitability:clamp(Number(r.habitability??1),0,1),recoveryCapacity:clamp(Number(r.recoveryCapacity??.5),0,1)};});return {baseline,regions:clone(baseline),history:[],revision:0};}
export function applyPhysicalConsequences(society,result){if(!society||!Array.isArray(society.regions)||!result?.regionImpacts)throw TypeError("Conséquences humaines invalides.");const next=clone(society),byId=new Map(next.regions.map(r=>[r.regionId,r])),changes=[];for(const impact of result.regionImpacts){const r=byId.get(impact.regionId);if(!r)continue;const x=clamp(Number(impact.exposure??0),0,1),d=clamp(Number(impact.damage??0),0,1),f=clamp(Number(impact.inundationFraction??0),0,1),type=result.event.type,mortality=type==="meteor-impact"?.38:type==="tsunami"?.045:type==="earthquake"?.018:type==="volcanic-eruption"?.025:.002,fatalities=Math.min(r.population-r.fatalities,r.population*x*mortality),displacementRate=clamp(x*(.08+d*.5)+f*.65,0,.95),displaced=Math.min(r.population-r.displacedPopulation,Math.max(0,r.population*displacementRate-r.displacedPopulation));r.fatalities+=fatalities;r.displacedPopulation+=displaced;r.infrastructure=clamp(r.infrastructure-d*.7-f*.5,0,1);r.foodSecurity=clamp(r.foodSecurity-d*.28-f*.35,0,1);r.habitability=clamp(r.habitability-d*.35-f*.9,0,1);r.stability=clamp(r.stability-d*.25-displacementRate*.3,0,1);changes.push({regionId:r.regionId,fatalities,displaced,infrastructure:r.infrastructure,habitability:r.habitability});}next.revision++;next.history.push({revision:next.revision,eventId:result.event.id,date:result.event.date,changes});return {society:next,changes};}
export function planAiResponses(society,{year=1444}={}){
 const actions=[];
 for(const r of society.regions){
  const displaced=r.population>0?r.displacedPopulation/r.population:0;
  if(r.habitability<.2){
   const target=society.regions.filter(candidate=>candidate.regionId!==r.regionId&&candidate.habitability>=.65&&candidate.foodSecurity>=.5&&(r.countryId==null||candidate.countryId===r.countryId)).sort((a,b)=>(b.habitability*b.foodSecurity)-(a.habitability*a.foodSecurity)||a.regionId.localeCompare(b.regionId))[0];
   actions.push({id:"resettle:"+r.regionId+":"+year,type:target?"resettle":"evacuate",regionId:r.regionId,targetRegionId:target?.regionId??null,priority:1,reason:target?"Réinstallation vers une région plus sûre":"Mise à l'abri d'une région devenue inhabitable"});
  }else if(displaced>.08)actions.push({id:"evacuate:"+r.regionId+":"+year,type:"evacuate",regionId:r.regionId,priority:1,reason:"Déplacement important de population"});
  if(r.infrastructure<.72)actions.push({id:"rebuild:"+r.regionId+":"+year,type:"rebuild",regionId:r.regionId,priority:2,reason:"Infrastructures endommagées"});
  if(r.foodSecurity<.55)actions.push({id:"aid:"+r.regionId+":"+year,type:"request-aid",regionId:r.regionId,priority:2,reason:"Insécurité alimentaire"});
 }
 return actions.sort((a,b)=>a.priority-b.priority||a.id.localeCompare(b.id));
}
export function applyAiResponses(society,actions){
 const next=clone(society),byId=new Map(next.regions.map(r=>[r.regionId,r])),applied=[];
 for(const action of actions){
  const r=byId.get(action.regionId);if(!r)continue;
  if(action.type==="rebuild")r.infrastructure=clamp(r.infrastructure+.12*r.recoveryCapacity,0,1);
  if(action.type==="request-aid")r.foodSecurity=clamp(r.foodSecurity+.08*r.recoveryCapacity,0,1);
  if(action.type==="evacuate"){
   const sheltered=Math.min(r.displacedPopulation,Math.max(1,r.population*.1));
   r.displacedPopulation-=sheltered;r.shelteredPopulation+=sheltered;r.stability=clamp(r.stability+.035,0,1);
  }
  if(action.type==="resettle"){
   const target=byId.get(action.targetRegionId);
   if(target){
    const moved=Math.min(r.displacedPopulation,Math.max(1,r.population*.15));
    r.displacedPopulation-=moved;r.population-=moved;r.migratedOutPopulation+=moved;
    target.population+=moved;target.incomingMigrants+=moved;
   }
  }
  applied.push({...action,status:"scheduled"});
 }
 if(applied.length){next.revision++;next.history.push({revision:next.revision,type:"ai-response",actions:applied});}
 return {society:next,actions:applied};
}
