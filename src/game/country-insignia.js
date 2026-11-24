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
const VALID_FLAG_CODES=new Set(("ad ae af ag ai al am ao aq ar as at au aw ax az ba bb bd be bf bg bh bi bj bl bm bn bo bq br bs bt bv bw by bz ca cc cd cf cg ch ci ck cl cm cn co cr cu cv cw cx cy cz de dj dk dm do dz ec ee eg eh er es et fi fj fk fm fo fr ga gb gd ge gf gg gh gi gl gm gn gp gq gr gs gt gu gw gy hk hm hn hr ht hu id ie il im in io iq ir is it je jm jo jp ke kg kh ki km kn kp kr kw ky kz la lb lc li lk lr ls lt lu lv ly ma mc md me mf mg mh mk ml mm mn mo mp mq mr ms mt mu mv mw mx my mz na nc ne nf ng ni nl no np nr nu nz om pa pe pf pg ph pk pl pm pn pr ps pt pw py qa re ro rs ru rw sa sb sc sd se sg sh si sj sk sl sm sn so sr ss st sv sx sy sz tc td tf tg th tj tk tl tm tn to tr tt tv tw tz ua ug um us uy uz va vc ve vg vi vn vu wf ws ye yt za zm zw xk gb-sct").split(" "));
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
    if(VALID_FLAG_CODES.has(code))return code;
  }
  const name=String(p.NAME??p.ADMIN??p.name??p.NAME_EN??"");
  const mapped=COUNTRY_CODES[name]??"";return VALID_FLAG_CODES.has(mapped)?mapped:"";
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
  if(flagUrl)return{type:"flag",src:flagUrl,alt:"Drapeau de "+name,source:"FlagCDN"};
  return{type:"none",src:"",alt:"",source:""};
}
