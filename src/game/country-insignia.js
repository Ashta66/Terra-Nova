const COMMONS="https://commons.wikimedia.org/wiki/Special:FilePath/";
const COATS=Object.freeze({
  "France":"Arms_of_the_Kingdom_of_France_(Ancien).svg",
  "Kingdom of France":"Arms_of_the_Kingdom_of_France_(Ancien).svg",
  "England":"Royal_Arms_of_England_(1399-1603).svg",
  "Kingdom of England":"Royal_Arms_of_England_(1399-1603).svg",
  "Castile":"Blason_Castille.svg",
  "Spain":"Lesser_Royal_Arms_of_the_Spanish_Monarch_(c.1504-1700).svg",
  "Venice":"Coat_of_arms_of_Republic_of_Venice.svg",
  "Japan":"Imperial_Seal_of_Japan.svg",
  "Poland":"COA_Kingdom_of_Poland_with_crest.svg",
  "Kingdom of Castile":"Blason_Castille.svg",
  "Portugal":"Coat_of_arms_of_the_Kingdom_of_Portugal_(Enciclopedie_Diderot).svg",
  "Kingdom of Portugal":"Coat_of_arms_of_the_Kingdom_of_Portugal_(Enciclopedie_Diderot).svg",
  "Ottoman Empire":"Osmanli-nisani.svg",
  "Ottoman Empire (1882–1922)":"Osmanli-nisani.svg",
  "Russian Empire":"Coat_of_arms_of_the_Russian_Empire.svg",
  "Russia":"Russia-Coat_of_arms.svg",
  "Holy Roman Empire":"Generic_Arms_of_the_Holy_Roman_Emperor_(after_1433).svg",
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
  const y=Number(year);
  const isDatedCoat=name==="France"||name==="Kingdom of France"?y<=1792||(y>=1814&&y<=1830)
    :name==="England"||name==="Kingdom of England"?y>=1399&&y<=1603
    :name==="Ottoman Empire"?y>=1882&&y<=1922
    :name==="Russian Empire"?y>=1882&&y<=1917
    :name==="Russia"?y>=1993
    :name==="Portugal"||name==="Kingdom of Portugal"?y>=1763&&y<=1910
    :name==="Spain"?y>=1504&&y<=1700
    :name==="Venice"?y>=1595&&y<=1797
    :name==="Holy Roman Empire"?y>=1433&&y<=1806
    :true;
  if(coat&&isDatedCoat){
    return{type:"coat",src:COMMONS+encodeURIComponent(coat),fallback:flagUrl,alt:"Armoiries historiques de "+name,source:"Wikimedia Commons"};
  }
  return{type:"flag",src:flagUrl,alt:"Drapeau de "+name,source:"FlagCDN"};
}
