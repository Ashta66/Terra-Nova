const COMMONS="https://commons.wikimedia.org/wiki/Special:FilePath/";
const COATS=Object.freeze({
  "France":"Arms_of_the_Kingdom_of_France_(Ancien).svg",
  "Kingdom of France":"Arms_of_the_Kingdom_of_France_(Ancien).svg",
  "England":"Royal_arms_of_England.svg",
  "Kingdom of England":"Royal_arms_of_England.svg",
  "Castile":"Blason_Castille.svg",
  "Kingdom of Castile":"Blason_Castille.svg",
  "Portugal":"Coat_of_arms_of_the_Kingdom_of_Portugal_(Enciclopedie_Diderot).svg",
  "Kingdom of Portugal":"Coat_of_arms_of_the_Kingdom_of_Portugal_(Enciclopedie_Diderot).svg",
  "Ottoman Empire":"Osmanli-nisani.svg",
  "Ottoman Empire (1882–1922)":"Osmanli-nisani.svg",
  "Muscovy":"Coat_of_arms_of_the_Russian_Empire.svg",
  "Russian Empire":"Coat_of_arms_of_the_Russian_Empire.svg",
  "Russia":"Coat_of_arms_of_the_Russian_Empire.svg",
  "Holy Roman Empire":"Coat_of_Arms_of_the_Holy_Roman_Emperor_(c.1400-c.1433).svg",
  "Polish-Lithuanian Commonwealth":"COA_Polish-Lithuanian_Commonwealth.svg"
});
const COUNTRY_CODES=Object.freeze({
  "United States":"us","United Kingdom":"gb","England":"gb","France":"fr","Spain":"es","Castile":"es","Portugal":"pt",
  "Ottoman Empire":"tr","Turkey":"tr","Russia":"ru","Muscovy":"ru","China":"cn","Ming":"cn","Ming Dynasty":"cn","Qing":"cn",
  "Japan":"jp","Poland":"pl","Lithuania":"lt","Netherlands":"nl","Dutch Republic":"nl","Venice":"it","Italy":"it",
  "Sweden":"se","Norway":"no","Denmark":"dk","Scotland":"gb-sct","Ireland":"ie","Austria":"at","Prussia":"de",
  "German Empire":"de","Holy Roman Empire":"de","Switzerland":"ch","Hungary":"hu","Bohemia":"cz","Greece":"gr",
  "Byzantine Empire":"gr","Brazil":"br","Mexico":"mx","Morocco":"ma","Ethiopia":"et","Korea":"kr","Joseon":"kr"
});
function readCountryCode(feature){
  const p=feature?.properties??{};
  for(const value of [p.ISO_A2,p.ISO_A2_EH,p.iso_a2,p.WB_A2,p.ADM0_A3,p.SOV_A3]){
    const code=String(value??"").trim().toLowerCase();
    if(/^[a-z]{2}$/.test(code)&&code!=="-99")return code;
  }
  const name=String(p.NAME??p.ADMIN??p.name??p.NAME_EN??"");
  return COUNTRY_CODES[name]??"";
}
export function resolveCountryInsignia(feature,year=1444){
  const p=feature?.properties??{};
  const name=String(p.NAME??p.ADMIN??p.name??p.NAME_EN??"");
  const code=readCountryCode(feature);
  const flagUrl=code?(`https://flagcdn.com/w160/${code}.png`):"";
  const coat=COATS[name];
  const isDatedCoat=name==="Ottoman Empire"||name==="Russia"||name==="Russian Empire"||name==="Muscovy"
    ?Number(year)>=1882
    :name==="Portugal"||name==="Kingdom of Portugal"?Number(year)>=1700
    :true;
  if(coat&&isDatedCoat){
    return{type:"coat",src:COMMONS+encodeURIComponent(coat),fallback:flagUrl,alt:"Armoiries historiques de "+name,source:"Wikimedia Commons"};
  }
  return{type:"flag",src:flagUrl,alt:"Drapeau de "+name,source:"FlagCDN"};
}
