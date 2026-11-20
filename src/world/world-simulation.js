import {applyPhysicalEvent} from "./physical-geography.js";
import {applyPhysicalConsequences,planAiResponses,applyAiResponses} from "./society-engine.js";
// Disasters never transfer sovereignty by themselves. Wars, treaties and independence
// remain explicit, sourced political events handled by sovereignty-engine.js.
export function advanceWorldSimulation({physicalWorld,society,event,year}){const physical=applyPhysicalEvent(physicalWorld,event),human=applyPhysicalConsequences(society,physical.result),planned=planAiResponses(human.society,{year:year??Number(String(event.date).slice(0,4))}),applied=applyAiResponses(human.society,planned);return {physicalWorld:physical.world,society:applied.society,report:{event:physical.result.event,affectedCells:physical.result.affectedCells.length,regionImpacts:physical.result.regionImpacts,humanConsequences:human.changes,aiActions:applied.actions}};}
