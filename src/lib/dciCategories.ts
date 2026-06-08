/**
 * dciCategories.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Détection automatique de catégorie thérapeutique d'un médicament.
 *
 * Architecture hybride en 3 couches (du plus précis au plus flou) :
 *
 * 1. CACHE APPRENTISSAGE (localStorage) — produits déjà catégorisés
 *    manuellement par le pharmacien. Hash exact sur le nom normalisé.
 *
 * 2. BASE DCI OMS étendue — ~ 300 substances actives avec leur classe ATC,
 *    enrichie pour le marché africain (Coartem, Duo-Cotecxin, ALU, etc.).
 *    Détection par mot-clé exact ou substring.
 *
 * 3. RIEN — le produit reste non catégorisé (visible dans "Tous" uniquement).
 *
 * Cache local : permet la détection 100% hors-ligne après le premier import.
 */

// ════════════════════════════════════════════════════════════════════════════
//  TYPES
// ════════════════════════════════════════════════════════════════════════════
export type TherapeuticCategory =
  | 'Antibiotiques'
  | 'Antipaludéens'
  | 'Antiparasitaires'
  | 'Antiviraux'
  | 'Antifongiques'
  | 'Analgésiques'
  | 'Anti-inflammatoires'
  | 'Cardiovasculaires'
  | 'Antihypertenseurs'
  | 'Diabète'
  | 'Vitamines'
  | 'Minéraux'
  | 'Gastro'
  | 'Respiratoire'
  | 'Dermato'
  | 'Gynécologie'
  | 'Ophtalmologie'
  | 'ORL'
  | 'Neuro / Psy'
  | 'Anesthésie'
  | 'Hématologie'
  | 'Urologie'
  | 'Pédiatrie'
  | 'Maternité'
  | 'Cosmétique'
  | 'Solutés / Perf'
  | 'Vaccins'
  | 'Contraception'
  | 'Hormones'
  | 'Autre';

export const ALL_CATEGORIES: TherapeuticCategory[] = [
  'Antibiotiques', 'Antipaludéens', 'Antiparasitaires', 'Antiviraux', 'Antifongiques',
  'Analgésiques', 'Anti-inflammatoires',
  'Cardiovasculaires', 'Antihypertenseurs', 'Diabète',
  'Vitamines', 'Minéraux',
  'Gastro', 'Respiratoire', 'Dermato',
  'Gynécologie', 'Ophtalmologie', 'ORL', 'Neuro / Psy', 'Anesthésie',
  'Hématologie', 'Urologie', 'Pédiatrie', 'Maternité', 'Cosmétique',
  'Solutés / Perf', 'Vaccins', 'Contraception', 'Hormones',
  'Autre',
];

// ════════════════════════════════════════════════════════════════════════════
//  BASE DCI ÉTENDUE — classe ATC + DCI + marques locales Afrique centrale
// ════════════════════════════════════════════════════════════════════════════
// Source : OMS ATC index + Pharmacopée africaine + marques fréquentes RDC/Congo
// Liste exhaustive en minuscules pour matching insensible à la casse.

const DCI_DATABASE: Array<[TherapeuticCategory, string[]]> = [
  // ── ANTIBIOTIQUES (J01) ────────────────────────────────────────────────────
  ['Antibiotiques', [
    // β-lactamines / pénicillines (J01C)
    'amoxicilline','amoxiciline','amox','amoxil','clamoxyl',
    'ampicilline','ampi','penbritin',
    'pénicilline','penicilline','peni g','peni v','penicillin',
    'cloxacilline','flucloxacilline','dicloxacilline',
    'oxacilline','meticilline',
    'amox clavulanique','amoxiciline acide clavulanique','augmentin','co-amoxiclav','amoxicilline ac clavul','clavulanate',
    'piperacilline','tazocilline','tazobactam',
    // Céphalosporines (J01D)
    'cefadroxil','céfadroxil','duricef',
    'cefalexine','céfalexine','keflex','cephalexin',
    'cefuroxime','céfuroxime','zinnat','zinacef',
    'cefixime','céfixime','suprax','cefspan',
    'ceftriaxone','rocephin','rocephine','rocéphine',
    'cefotaxime','céfotaxime','claforan',
    'ceftazidime','fortum',
    'cefpodoxime','orelox',
    'cefpirome','cefipime','cefepime',
    // Macrolides (J01F)
    'azithromycine','azithro','zithromax','azitro','azomax',
    'erythromycine','érythromycine','erythrocine',
    'clarithromycine','klacid','claribid',
    'roxithromycine','rulid',
    'spiramycine','rovamycine','rodogyl',
    // Aminosides (J01G)
    'gentamicine','gentamycine','gentalline','genticin',
    'amikacine','amiklin',
    'tobramycine','nebcine',
    'streptomycine',
    'kanamycine',
    'neomycine','néomycine',
    // Quinolones (J01M)
    'ciprofloxacine','cipro','ciflox','ciproxin',
    'levofloxacine','lévofloxacine','tavanic','levaquin',
    'ofloxacine','oflocet','tarivid',
    'norfloxacine','noroxin',
    'moxifloxacine','avelox',
    'enrofloxacine',
    // Tétracyclines (J01A)
    'doxycycline','vibramycine','doxylis','tolexine',
    'tétracycline','tetracycline',
    'minocycline','mynocine',
    'oxytetracycline',
    // Sulfamides / triméthoprime (J01E)
    'cotrimoxazole','bactrim','sulfamethoxazole','sulfaméthoxazole','triméthoprime','trimethoprime','sulprim',
    'sulfadiazine','sulfadiazine argentique',
    // Imidazolés / Nitrofurane (J01X / P01AB)
    'metronidazole','métronidazole','flagyl','metrogyl','rozex',
    'tinidazole','fasigyne',
    'secnidazole','sécnidazole','flagentyl',
    'ornidazole','tibéral','tiberal',
    'nitrofurantoine','furadantine','furadantin',
    // Glycopeptides (J01XA)
    'vancomycine','vancocin',
    'teicoplanine','targocid',
    // Autres
    'fosfomycine','monuril',
    'linezolide','linézolide','zyvoxid',
    'clindamycine','dalacin','dalacine',
    'chloramphenicol','chloramphénicol','tifomycine',
    // Génériques RDC/Congo / OMS
    'duo-cotrimoxazole','co-trimoxazole','tmp-smx',
    'antibio','antibiotique','antibiotic','antimicrobien',
  ]],

  // ── ANTIPALUDÉENS (P01B) ───────────────────────────────────────────────────
  ['Antipaludéens', [
    'artemether','artémether','artemether-luméfantrine','arteme luméfantrine',
    'artesunate','artésunate','arsumax','plasmotrim',
    'artemisinine','artémisinine','artémisine',
    'arteme + lumefantrine','coartem','coartem dispersible','coartem 80/480','coartem 20/120',
    'duo-cotecxin','duo cotecxin','duo-cotex','dihydroartémisinine pipéraquine','dha-piperaquine','dihydroartemisinine','piperaquine','pipéraquine',
    'falcimon','falcimon kit',
    'arteme amodiaquine','amodiaquine','flavoquine','camoquin',
    'asaq','asaq winthrop',
    'chloroquine','nivaquine','resochin',
    'quinine','quinimax','quinoforme','quinarsol','quinine sulfate','quinine résorcine','quinine resorcine','quinine sulfate',
    'mefloquine','méfloquine','lariam',
    'primaquine',
    'proguanil','paludrine',
    'pyrimethamine','pyriméthamine',
    'sulfadoxine pyriméthamine','sulfadoxine pyrimethamine','fansidar','sp','spaq',
    'doxypalu','malarone','atovaquone proguanil',
    'antipalu','antipaludéen','antimalaria','antimalarial','paludisme','malaria',
  ]],

  // ── ANTIPARASITAIRES (P02 / P03) ───────────────────────────────────────────
  ['Antiparasitaires', [
    'albendazole','zentel','albend','abz',
    'mébendazole','mebendazole','vermox','vermifuge',
    'ivermectine','stromectol','mectizan',
    'niclosamide','tredemine',
    'pyrantel','combantrin','helmintox','pyrantel pamoate',
    'praziquantel','biltricide','distocide',
    'lévamisole','levamisole','solaskil',
    'tiabendazole','thiabendazole','mintezol',
    'pamoate pyrvinium','povanyl',
    'antihelmintique','vermifuge','déparasitant','deparasitant','antiparasitaire',
    // Anti-amibiens
    'diloxanide','furamide',
    'paromomycine',
    'antiscabieux','perméthrine','permethrine','sprégal','spregal','elimite','crotamiton','eurax',
    'butoxide','butoxyde','antipoux',
  ]],

  // ── ANTIVIRAUX (J05) ───────────────────────────────────────────────────────
  ['Antiviraux', [
    'aciclovir','acyclovir','zovirax','herpevir',
    'valaciclovir','valacyclovir','zelitrex','valtrex',
    'oseltamivir','tamiflu',
    'zanamivir','relenza',
    'ribavirine','copegus',
    'lamivudine','epivir','3tc',
    'zidovudine','retrovir','azt',
    'tenofovir','viread',
    'efavirenz','sustiva','stocrin',
    'nevirapine','viramune',
    'antiretroviral','antirétroviral','arv','antiviral','antiviraux',
  ]],

  // ── ANTIFONGIQUES (J02 / D01) ──────────────────────────────────────────────
  ['Antifongiques', [
    'fluconazole','triflucan','diflucan',
    'kétoconazole','ketoconazole','nizoral',
    'itraconazole','sporanox',
    'miconazole','daktarin','gyno-daktarin',
    'clotrimazole','canesten','mycohydralin',
    'econazole','éconazole','pevaryl',
    'terbinafine','lamisil','fungitox',
    'griseofulvine','griséofulvine','fulcine',
    'nystatine','mycostatine',
    'amphotericine','amphotéricine','fungizone',
    'antifongique','antimycosique','mycose',
  ]],

  // ── ANALGÉSIQUES (N02) ─────────────────────────────────────────────────────
  ['Analgésiques', [
    'paracétamol','paracetamol','panadol','doliprane','dafalgan','efferalgan','algopyrine','tylenol','pcm',
    'aspirine','aspégic','aspegic','aspirin','kardégic','acide acétylsalicylique','acide acetylsalicylique','asa',
    'tramadol','contramal','topalgic','zaldiar','tramol',
    'codéine','codeine','codoliprane','algicalm','codepar',
    'paracétamol codéine','paracetamol codeine','codoliprane',
    'paracétamol tramadol','ixprim','zaldiar',
    'morphine','skenan','moscontin','sevredol','actiskenan',
    'fentanyl','durogesic',
    'oxycodone','oxynorm','oxycontin',
    'buprenorphine','temgesic','subutex','suboxone',
    'pethidine','péthidine','dolosal',
    'nefopam','néfopam','acupan',
    'antalgique','analgésique','analgesique','antidouleur',
  ]],

  // ── ANTI-INFLAMMATOIRES (M01) ──────────────────────────────────────────────
  ['Anti-inflammatoires', [
    'ibuprofène','ibuprofen','brufen','advil','nurofen','spedifen','antarene',
    'diclofénac','diclofenac','voltarène','voltaren','flector','diclac',
    'kétoprofène','ketoprofene','ketum','profenid','toprec',
    'naproxène','naproxene','apranax','naprosyn',
    'piroxicam','feldene',
    'meloxicam','méloxicam','mobic',
    'celecoxib','célécoxib','celebrex',
    'indométacine','indomethacine','indocid',
    'acide méfénamique','acide mefenamique','ponstyl','ponstan',
    'phenylbutazone','butazolidine',
    'tenoxicam','tilcotil',
    'nimesulide','nimésulide','nexen',
    'methylprednisolone','méthylprednisolone','solumedrol','medrol','depo-medrol',
    'prednisolone','solupred',
    'prednisone','cortancyl',
    'dexamethasone','dexaméthasone','dectancyl','soludecadron',
    'betamethasone','bétaméthasone','celestene','celestone','diprostene',
    'hydrocortisone','hydrocortisone','locoid','colofoam',
    'corticoïde','corticoide','cortisone','ains','anti-inflammatoire','anti inflammatoire',
  ]],

  // ── CARDIOVASCULAIRES / ANTIHYPERTENSEURS (C) ──────────────────────────────
  ['Antihypertenseurs', [
    // IEC
    'captopril','lopril','captolane',
    'enalapril','énalapril','renitec',
    'lisinopril','prinivil','zestril',
    'ramipril','triatec',
    'perindopril','périndopril','coversyl',
    'fosinopril','fosinopril',
    // ARA II
    'losartan','cozaar','hyzaar',
    'valsartan','tareg','diovan','exforge',
    'irbesartan','aprovel','coaprovel',
    'telmisartan','micardis',
    'candesartan','atacand',
    'olmesartan','olmetec',
    // β-bloquants
    'atenolol','aténolol','tenormin',
    'bisoprolol','cardensiel','soprol','detensiel',
    'metoprolol','métoprolol','seloken','lopressor',
    'propranolol','avlocardyl',
    'nebivolol','nébivolol','temerit',
    'carvedilol','kredex',
    'labetalol','trandate',
    // Inhibiteurs calciques
    'amlodipine','amlor','exforge','norvasc',
    'nifedipine','nifédipine','adalat','adalate',
    'nicardipine','loxen',
    'diltiazem','tildiem','mono-tildiem',
    'verapamil','isoptine',
    'lercanidipine','zanidip',
    // Diurétiques
    'furosemide','furosémide','lasilix','lasix',
    'hydrochlorothiazide','esidrex','hctz',
    'spironolactone','aldactone',
    'indapamide','fludex','natrilix',
    'bumetanide','burinex',
    'amiloride','modamide',
    // Centraux
    'methyldopa','méthyldopa','aldomet',
    'clonidine','catapressan',
    'moxonidine','physiotens',
    // Vasodilatateurs / Nitrés
    'isosorbide','isordil','risordan','monicor','imdur',
    'nitroglycerine','natispray','lenitral','trinipatch',
    'hydralazine','nepresol',
    'minoxidil','lonoten',
    'antihypertenseur','tension artérielle','hta','hypertension',
  ]],
  ['Cardiovasculaires', [
    // Antiarythmiques
    'amiodarone','cordarone','sedacoron',
    'flecainide','flécaïnide','flecaine',
    'sotalol','sotalex',
    'digoxine','digox',
    // Antiagrégants / Anticoagulants
    'clopidogrel','plavix',
    'ticagrelor','brilique',
    'aspirine cardio','kardegic','aspegic 100','asa 100',
    'héparine','heparine','heparine sodique','calciparine',
    'enoxaparine','énoxaparine','lovenox','clexane',
    'warfarine','coumadine',
    'acenocoumarol','sintrom',
    'fluindione','previscan',
    'rivaroxaban','xarelto',
    'apixaban','eliquis',
    'dabigatran','pradaxa',
    // Statines
    'simvastatine','zocor','lodales',
    'atorvastatine','tahor','lipitor','sortis',
    'rosuvastatine','crestor',
    'pravastatine','elisor','vasten',
    'fenofibrate','fénofibrate','lipanthyl',
    'gemfibrozil','lipur',
    'cholestyramine','questran',
    'ezetimibe','ezétimibe','ezetrol',
    // Vasculaires
    'pentoxifylline','torental',
    'naftidrofuryl','praxilene',
    'troxerutine','daflon','difrarel','venaflon','cyclo 3',
    // Médic. cœur
    'trinitrine','isosorbide',
    'molsidomine','corvasal',
    'cardio','arythmie','antiagrégant','anticoagulant','statine',
  ]],

  // ── DIABÈTE (A10) ──────────────────────────────────────────────────────────
  ['Diabète', [
    'metformine','metformin','glucophage','stagid','diabamyl',
    'glibenclamide','daonil','euglucan',
    'gliclazide','diamicron','glydium',
    'glimepiride','glimépiride','amarel',
    'glipizide','minidiab',
    'sitagliptine','januvia','janumet',
    'vildagliptine','galvus','eucreas',
    'saxagliptine','onglyza',
    'linagliptine','trajenta',
    'empagliflozine','jardiance',
    'dapagliflozine','forxiga',
    'canagliflozine','invokana',
    'pioglitazone','actos',
    'acarbose','glucor',
    'repaglinide','novonorm',
    'insuline','insulin','lantus','levemir','novorapid','humalog','actrapid','insulatard','mixtard','humuline','mixtard','insulin glargine','insuline glargine','insuline lispro','insuline aspart','insuline détémir','insuline detémir',
    'diabète','diabete','antidiabétique','antidiabetique','hypoglycémiant','glycémie','glycemie',
  ]],

  // ── VITAMINES / MINÉRAUX ───────────────────────────────────────────────────
  ['Vitamines', [
    'vitamine','vitamin','vit ','vitascorbol','rocaltrol','redoxon',
    'vitamine a','rétinol','retinol','axerol','vitamine a forte',
    'vitamine b','b complex','complexe b','bcomplex','b1','b2','b3','b6','b12',
    'thiamine','riboflavine','niacine','pyridoxine','cobalamine',
    'vitamine b9','acide folique','folate','speciafoldine',
    'vitamine b12','hydroxocobalamine','cyanocobalamine','dodecavit',
    'vitamine c','acide ascorbique','redoxon','vitascorbol','laroscorbine','upsa c','acerola',
    'vitamine d','d3','cholécalciférol','cholecalciferol','uvedose','adrigyl','sterogyl','zymad','vit d',
    'vitamine e','tocophérol','tocopherol','toco 500',
    'vitamine k','phytoménadione','vitamine k1','kanavit','konakion',
    'multivitamine','polyvitamine','centrum','supradyn','azinc','vitathera','vitalia','vitafer',
    'oligoélément','oligoelement',
  ]],
  ['Minéraux', [
    'calcium','calcidose','calperos','calcyforte','rocaltrol','caltrate','ostram',
    'magnésium','magnesium','magne b6','magne-b6','mag 2','magneb6','spasmag','cooper',
    'zinc','effizinc','rubozinc',
    'fer','iron','tardyferon','timoferol','fero gradumet','fumafer','sulfate ferreux','sulfate de fer','feralgine','feramyl','ferograd',
    'potassium','kaleorid','diffu-k',
    'sélénium','selenium',
    'iode','iodure',
    'phosphate','phosphalugel',
    'fluor','zymafluor',
  ]],

  // ── GASTRO (A02 / A03 / A07) ───────────────────────────────────────────────
  ['Gastro', [
    // IPP / antiacides
    'omeprazole','oméprazole','mopral','zoltum',
    'esomeprazole','ésoméprazole','inexium','nexium',
    'pantoprazole','inipomp','eupantol',
    'lansoprazole','lanzor','ogast',
    'rabeprazole','rabéprazole','pariet',
    'ranitidine','azantac','zantac','raniplex',
    'famotidine','pepdine','pepcid','famotin',
    'cimetidine','tagamet',
    // Antiacides
    'hydroxyde aluminium','phosphalugel','maalox','gelmax','riopan','rocgel','pepsane','gaviscon',
    'almagate','rocgel',
    'magaldrate','riopan',
    // Antidiarrhéiques
    'loperamide','lopéramide','imodium','dyspagon',
    'racecadotril','tiorfan','tiorfast','hidrasec',
    'diosmectite','smecta','smectalia','dysentry kit',
    'nifuroxazide','ercefuryl','panfurex',
    'saccharomyces boulardii','ultra levure','ultra-levure','enterol',
    'attapulgite','actapulgite','gelox',
    // Antiémétiques
    'metoclopramide','métoclopramide','primperan','primpéran',
    'domperidone','dompéridone','motilium','peridys','motilium pédiatrique',
    'ondansetron','ondansétron','zophren','setofilm',
    'metopimazine','métopimazine','vogalène','vogalene',
    // Laxatifs
    'lactulose','duphalac','lactugal','laxaron',
    'macrogol','forlax','movicol','transipeg',
    'paraffine','laxamalt','lansoyl',
    'sorbitol','sorbitol delalande',
    'bisacodyl','dulcolax','contalax',
    'séné','séné',
    // Anti-spasmodiques
    'phloroglucinol','spasfon','spasmenil',
    'mebeverine','mébéverine','duspatalin',
    'trimebutine','débridat','debridat',
    'butylscopolamine','buscopan','spasmocalm','spasmonol',
    'hyoscine','buscopan',
    // Autres
    'ursodesoxycholique','ursolvan','delursan',
    'colestyramine','questran',
    'pancréatine','créon','eurobiol',
    'antiacide','reflux','rgo','gastrite','ulcère','ulcere','antiulcéreux',
  ]],

  // ── RESPIRATOIRE (R) ───────────────────────────────────────────────────────
  ['Respiratoire', [
    // Bronchodilatateurs
    'salbutamol','ventoline','ventolin','airomir','asthalin',
    'terbutaline','bricanyl',
    'formoterol','formotérol','foradil','oxis',
    'salmeterol','salmétérol','sérévent','serevent',
    'fenoterol','berotec',
    'ipratropium','atrovent',
    'tiotropium','spiriva',
    // Corticoïdes inhalés
    'béclométhasone','beclometasone','beclomethasone','beclo','qvar','beclojet','beclospray',
    'budesonide','budésonide','pulmicort','symbicort',
    'fluticasone','flixotide','sérétide','seretide','flovent','avamys','flonase',
    'mometasone','mométasone','nasonex',
    'ciclesonide','ciclésonide','alvesco',
    // Antihistaminiques (R06)
    'cetirizine','cétirizine','zyrtec','virlix','alairgix','cetilix','xyzall',
    'loratadine','clarityne','claritin','tellfast','clarytine',
    'desloratadine','aerius',
    'fexofenadine','fexofénadine','telfast',
    'levocetirizine','xyzall',
    'ebastine','kestin','kestinlyo',
    'mizolastine','mizollen',
    'rupatadine','rupafin','wystamm',
    'chlorphéniramine','chlorpheniramine','polaramine',
    'dimétindène','dimetindène','fenistil',
    'dexchlorpheniramine','polaramine',
    // Antitussifs / Expectorants
    'codéine sirop','codéthyline','codoliprane','toplexil','tussipax','néocodion','neo-codion','euphon','silomat',
    'dextrométhorphane','dextromethorphane','tussidane','drill','toplexil',
    'pholcodine','dimétane',
    'noscapine','tussisedal',
    'oxomémazine','oxomemazine','toplexil',
    'acétylcystéine','acetylcysteine','exomuc','fluimucil','mucomyst','acetylcisteyne','solmucol',
    'carbocistéine','carbocisteine','rhinathiol','bronchokod','mucothiol',
    'ambroxol','muxol','surbronc','mucosolvan','toxol',
    'bromhexine','bisolvon','bromhexan',
    'erdosteine','vectrine',
    'sobrerol','sobrepin',
    'guaifenesine','muxol','vicks expectorant','toplexil',
    // Décongestionnants nasaux
    'pseudoéphédrine','pseudoephedrine','actifed',
    'oxymétazoline','aturgyl','pernazene',
    'xylométazoline','otrivin','rhinofluimucil',
    'éphédrine','asthme','asthma','bronchospasme','asthmatique','expectorant','mucolytique','antitussif','sirop toux','rhume','grippe',
  ]],

  // ── DERMATO (D) ────────────────────────────────────────────────────────────
  ['Dermato', [
    // Corticoïdes topiques
    'hydrocortisone','locoid','colofoam','aphtoral',
    'bétaméthasone','betamethasone','betneval','diprosone','celestoderm','diprolene','betnesol',
    'triamcinolone','kenacort','triamcort',
    'mometasone','mométasone','elocom',
    'desonide','locapred','tridesonit',
    'clobetasol','clobétasol','dermoval','clarelux',
    'fluocinolone','synalar',
    // Antifongiques topiques
    'éconazole','econazole','pevaryl','dermazol','dermomycose',
    'kétoconazole','ketoconazole','ketoderm','kétoderme','nizoral creme','nizoral crème',
    'miconazole','daktarin','dermomycose',
    'clotrimazole','canesten','mycohydralin','candistan',
    'terbinafine','lamisil','sebiprox','fungidexan',
    'amorolfine','locéryl','locerylcrem',
    'butenafine','butenix',
    'griseofulvine','griséofulvine','fulcine','griseofuline',
    'tioconazole','trosyd',
    'sertaconazole','monazol',
    // Antiseptiques / désinfectants
    'chlorhexidine','hibitane','hibiscrub','septivon','plurexid','collunovar','eludril',
    'povidone iodée','povidone iodine','betadine','iodopolyvidone',
    'eosine','éosine','éosine aqueuse',
    'alcool 70','alcool 90','alcool éthylique','alcool ethylique','éthanol',
    'eau oxygénée','peroxyde','peroxide','oxygenée',
    'mercurochrome','mercryl',
    'cetrimide','savlon',
    'crésyl','cresyl','phénol','phenol',
    // Antibiotiques topiques
    'mupirocine','bactroban','mupibact',
    'acide fusidique','fucidine','fucithalmic',
    'érythromycine gel','erythromycine gel','erythrogel',
    'clindamycine gel','dalacine t',
    'sulfadiazine argentique','flammazine','dermazine','sulfadiazine ag',
    'tetracycline pommade','aureomycine','auréomycine',
    'gentamicine pommade','genta crème','gentalline crème',
    'néomycine creme','néomycine crème','bétadine',
    // Anti-acné
    'peroxyde benzoyle','peroxyde benzoyle','panoxyl','curacné','curaspot',
    'adapalene','adapalène','differin',
    'tretinoine','trétinoïne','aberel','locacid','effederm',
    'isotretinoine','isotrétinoïne','curacné','roaccutane',
    'erythromycine acne','érythromycine acné','eryacne',
    // Eczéma / psoriasis
    'tacrolimus topique','protopic',
    'pimecrolimus','elidel',
    'calcitriol','silkis',
    'calcipotriol','daivonex','daivobet',
    // Cicatrisants / Hydratants
    'cicatryl','cicaplast','cicabio','cicalfate','cicatridine','cicatril',
    'tulle gras','jelonet','vaseline','vaseline officinale',
    'glycérine','glycerine','glycérolé',
    'paraffine pommade','paraffine vaseline',
    'urée','uree','uréadin','urea','uréa','vit a creme','vit a',
    'oxyde de zinc','mitosyl','aldermyl','zincoderm','oxydes',
    'allantoine','allantoïne','cicalfate',
    'panthénol','panthenol','dexpanthénol','dexpanthenol','bepanthen','bepanthène',
    'centella','asiaticoside',
    'aloe vera','aloès','aloes',
    // Antiscabieux / antipoux
    'perméthrine','permethrine','sprégal','spregal','elimite',
    'crotamiton','eurax',
    'malathion','priolicen',
    'pyréthrines','pyrethrines','pyrethrin','spregal',
    'lindane',
    'butoxide','butoxyde','itax',
    'crème','creme','pommade','onguent','baume','baume du tigre','lotion','gel cutané','spray cutané','dermique','topique','cutané','cosmétique',
  ]],

  // ── GYNÉCOLOGIE / OBSTÉTRIQUE / CONTRACEPTION (G) ──────────────────────────
  ['Gynécologie', [
    'misoprostol','cytotec','gymiso',
    'mifepristone','mifépristone','myfegyne',
    'oxytocine','syntocinon',
    'methylergometrine','méthylergométrine','méthergine','methergin',
    'phloroglucinol','spasfon',
    'progestérone','utrogestan','duphaston',
    'didrogestérone','dydrogesterone','duphaston',
    'cyproterone','cyprotérone','androcur',
    'ovules','tergynan','polygynax','sertaconazole','fluomizin','flagystatine','flagystatin',
    'metronidazole ovule','métronidazole ovule','flagyl ovule',
    'tampons','protections hygiéniques','serviette','tampax','always','protège-slip','protections',
    'misogyn','misopros','gynobel',
    'écouvillon vaginal','test grossesse','tg','clearblue','first response',
    'douche vaginale','saforelle','lactacyd','gynophilus','gynéphar',
    'gynéco','gyneco','obstétrique','obstetrique','vaginal','vaginite','vulvite','candidose vaginale','infection vaginale',
  ]],
  ['Contraception', [
    'pilule','contraceptif','contraception','levonorgestrel','norethistérone','norethisterone','jasmine','jasminelle','melodia','minidril','adépal','adepal','daily','diane 35','cilest','desogestrel','optidril','cerazette','microval','optilova','olaira','rigevidon',
    'norlevo','postinor','lévonorgestrel 1.5 mg','ellaone','ulipristal',
    'preservatif','préservatif','condom','manix','durex','protex','sympathea','femidom','prudence',
    'sterilet','stérilet','diu','jaydess','kyleena','mirena','sterilet cuivre','copper t',
    'implant contraceptif','implanon','nexplanon',
    'patch contraceptif','evra',
    'spermicide','pharmatex','alpagelle',
    'planning familial','contraceptif d urgence','contraception urgence','pilule lendemain',
  ]],
  ['Maternité', [
    'acide folique grossesse','speciafoldine','folate grossesse',
    'fer grossesse','iron grossesse','tardyferon b9','timoferol b9',
    'gestarelle','femibion','elevit','prenatal','prégnacare',
    'pre-natal','postnatal','allaitement','vitamine prénatale','grossesse','enceinte','maternité',
    'colostrum','lactaid','galactogogue','galactagogue','tisane allaitement','feniglet','feniglet pédiatrique',
  ]],

  // ── OPHTALMOLOGIE (S01) ────────────────────────────────────────────────────
  ['Ophtalmologie', [
    'tobramycine ophtalmique','tobrex','tobradex',
    'gentamicine collyre','gentalline collyre','genta-collyre',
    'oflocet collyre','ofloxacine collyre',
    'azithromycine collyre','azyter',
    'chloramphénicol collyre','aureomycine collyre',
    'cromoglycate','opticron','opticrom','cromabak',
    'ketotifene','kétotifène','zaditen',
    'olopatadine','opatanol',
    'levocabastine','lévocabastine','levophta',
    'oxybuprocaine','oxybuprocaïne','novésine','novesine',
    'tetracaine','tétracaïne',
    'pilocarpine',
    'timolol collyre','timoptol','digaol',
    'latanoprost','xalatan','xaloptic',
    'travoprost','travatan',
    'bimatoprost','lumigan',
    'brimonidine','alphagan',
    'dorzolamide','trusopt','cosopt',
    'acetazolamide','diamox',
    'cyclopentolate','skiacol','mydriaticum',
    'tropicamide','mydriaticum',
    'phényléphrine','phenylephrine','neosynephrine','néosynéphrine',
    'larmes artificielles','optive','dacrylux','dacryoserum','dacryo','vismed','systane','aqualarm','hylo','celluvisc',
    'collyre','collyrium','larme artificielle','larmes art','ophtalmique','oeil','ophtalmologie','conjonctivite','glaucome','cataracte',
  ]],

  // ── ORL ────────────────────────────────────────────────────────────────────
  ['ORL', [
    'rifamycine','otofa','rifocine',
    'polymyxine néomycine','antibiocorticoïde','polydexa','panotile',
    'ciprofloxacine auriculaire','ciplox ear','ciloxan',
    'oxytétracycline auriculaire','oxytetracycline auriculaire','synalar otologique','panotile',
    'docusate','docusate sodique','cerumenex','ceruspray','cérulyse','cerulyse','audispray',
    'eau oxygenée auriculaire',
    'lidocaine auriculaire','xylocaine spray','collun-otal',
    'fluticasone nasal','flixonase','avamys',
    'mometasone nasal','nasonex',
    'béclométhasone nasal','beconase',
    'budésonide nasal','rhinocort',
    'lavage nasal','sterimar','stérimar','marimer','prorhinel','rhinodose','physiologica',
    'sérum physiologique','serum physiologique','nacl 0.9','isotonique',
    'pivalone','rhinofluimucil',
    'oxymétazoline nasal','aturgyl',
    'naphazoline','privine','naphtyzine',
    'chlorhexidine','collunovar',
    'maux gorge','sucette gorge','pastilles gorge','strepsils','pholcones','hexalyse','solutricine','drill collutoire','lysopaïne','lysopaine','vibrocil','collumune','locabiotal','collunosol',
    'fusafungine','locabiotal',
    'spray buccal','collutoire','bain bouche','bain de bouche','eludril','listerine','hextril','givalex',
    'orl','nez','oreille','gorge','sinusite','rhinite','otite','pharyngite','laryngite','angine',
  ]],

  // ── NEURO / PSY (N) ────────────────────────────────────────────────────────
  ['Neuro / Psy', [
    // Antiépileptiques
    'phenobarbital','phénobarbital','gardenal','aphenylbarbit',
    'phenytoine','phénytoïne','dihydan',
    'carbamazepine','carbamazépine','tegretol','tégrétol',
    'valproate','dépakine','depakine','depakote','convulex','valpromide','valpilen',
    'lamotrigine','lamictal',
    'levetiracetam','levétiracétam','keppra','tilelev',
    'oxcarbazepine','oxcarbazépine','trileptal',
    'topiramate','epitomax','topamax',
    'gabapentine','neurontin',
    'pregabaline','prégabaline','lyrica',
    'clonazepam','clonazépam','rivotril',
    'diazepam','diazépam','valium','valoid','seresta',
    'clobazam','urbanyl',
    // Antidépresseurs
    'amitriptyline','laroxyl',
    'imipramine','tofranil',
    'clomipramine','anafranil',
    'fluoxetine','prozac','fluctine',
    'paroxetine','deroxat','paxil','seroxat',
    'sertraline','zoloft','seralin',
    'citalopram','seropram',
    'escitalopram','seroplex',
    'venlafaxine','effexor','effexorlp',
    'duloxetine','cymbalta',
    'mirtazapine','norset','remeron',
    'tianeptine','stablon',
    // Anxiolytiques / Hypnotiques
    'alprazolam','xanax',
    'bromazepam','lexomil',
    'lorazepam','temesta',
    'oxazepam','seresta',
    'prazepam','lysanxia',
    'zopiclone','imovane','imovan',
    'zolpidem','stilnox','stilnoct',
    'hydroxyzine','atarax','atarax sirop',
    'cyproheptadine','periactin',
    'meprobamate','equanil',
    // Antipsychotiques
    'risperidone','rispéridone','risperdal',
    'olanzapine','zyprexa',
    'quetiapine','quétiapine','xeroquel',
    'haloperidol','halopéridol','haldol',
    'chlorpromazine','largactil','melleril',
    'amisulpride','solian',
    'clozapine','leponex',
    'aripiprazole','abilify',
    // Antiparkinsoniens
    'levodopa','lévodopa','modopar','sinemet',
    'bromocriptine','parlodel',
    'piribedil','trivastal',
    'rasagiline','azilect',
    'trihexyphenidyle','artane',
    // Migraines
    'sumatriptan','imigrane','imitrex',
    'zolmitriptan','zomig',
    'rizatriptan','maxalt',
    'ergotamine','gynergène','migwell',
    'flunarizine','sibelium','flunostab',
    'pizotifene','sanmigran',
    'propranolol migraine',
    'topiramate migraine',
    // Démence
    'donepezil','aricept',
    'rivastigmine','exelon',
    'galantamine','reminyl',
    'memantine','ebixa','axura',
    // Stimulants
    'methylphenidate','méthylphénidate','ritaline','concerta',
    'modafinil','modiodal','provigil',
    'antiépileptique','antidépresseur','antidepresseur','anxiolytique','hypnotique','somnifere','sommeil','dépression','depression','anxiété','anxiete','migraine','epilepsie','épilepsie','convulsion','schizophrénie','schizophrenie','parkinson','alzheimer','démence','demence',
  ]],

  // ── HÉMATOLOGIE / SANG ─────────────────────────────────────────────────────
  ['Hématologie', [
    'fer iv','fer injection','venofer','ferrisat','injectafer',
    'epoétine','eprex','neorecormon','epoétine alpha',
    'darbepoetine','aranesp',
    'filgrastim','neupogen','granocyte',
    'pegfilgrastim','neulasta',
    'plaquenil','hydroxychloroquine',
    'azathioprine','imurel',
    'cyclosporine','neoral','sandimmun',
    'mycophenolate','cellcept','myfortic',
    'tacrolimus','prograf','advagraf',
    'methotrexate','méthotrexate','novatrex','imeth','metoject',
    'rituximab','mabthera',
    'transfusion','globules rouges','plaquettes',
  ]],

  // ── UROLOGIE ───────────────────────────────────────────────────────────────
  ['Urologie', [
    'finasteride','finastéride','chibro-proscar','propecia',
    'dutasteride','dutastéride','avodart','combodart',
    'tamsulosine','omix','josir',
    'alfuzosine','xatral',
    'silodosine','urorec','silodyx',
    'doxazosine','zoxan','cardura',
    'oxybutynine','ditropan','driptane','kentera',
    'solifenacine','vesicare','vesirig',
    'darifenacine','emselex',
    'tolterodine','detrusitol',
    'mirabegron','mirabégron','betmiga',
    'sildenafil','viagra','revatio','viagrabar',
    'tadalafil','cialis','adcirca',
    'vardenafil','levitra',
    'alprostadil','caverject',
    'desmopressine','minirin','octostim',
    'cranberry','urell','azo cranberry','urinaire',
    'prostate','vessie','incontinence','urinaire','dysurie',
  ]],

  // ── ANESTHÉSIE / ANTALGIE LOCALE ───────────────────────────────────────────
  ['Anesthésie', [
    'lidocaine','lidocaïne','xylocaïne','xylocaine','xylocaine adrenaline',
    'bupivacaïne','bupivacaine','marcaine','sensorcaine',
    'ropivacaïne','ropivacaine','naropéine','naropeine',
    'prilocaine','citanest','emla',
    'mepivacaine','carbocaine','scandicaine',
    'procaine','procaïne','procaïne',
    'tetracaine','tétracaïne','pontocaïne',
    'anesthésique local','anesthesique local','anesth local',
    'propofol','diprivan','propoven',
    'thiopental','penthotal',
    'ketamine','kétamine','ketalar',
    'midazolam','hypnovel','dormicum',
    'fentanyl','sufentanil','remifentanil','rémifentanil','sufenta',
    'curare','rocuronium','vécuronium','vecuronium','atracurium','suxaméthonium','suxamethonium','suxam',
    'sevoflurane','sévoflurane','sevorane',
    'desflurane','suprane',
    'protoxyde','protoxide','protoxyde azote','n2o',
    'naloxone','narcan',
    'flumazenil','anexate',
    'sugammadex','bridion',
    'anesthésie','anesthesie','anesthésiste','anesthesiste','sédation','sedation',
  ]],

  // ── HORMONES ───────────────────────────────────────────────────────────────
  ['Hormones', [
    'levothyroxine','lévothyroxine','levothyrox','euthyrox','tirosint','l-thyroxine',
    'liothyronine','cynomel',
    'thyroxine','thyroide',
    'methimazole','méthimazole','neomercazole','néomercazole',
    'propylthiouracile','basdene',
    'estradiol','provames','oestrodose','estreva','estrofem','progynova',
    'estrogenes','oestrogenes','oestrogen','prémarin','premarin',
    'progesterone','utrogestan','duphaston','progestan',
    'medroxyprogesterone','depo-provera',
    'testosterone','testostérone','androtardyl','nebido','andriol','andractim',
    'dehydroepiandrosterone','dhea',
    'hydrocortisone','hydrocortisone hémisuccinate','hemisuccinate',
    'desmopressine','minirin',
    'somatropin','genotonorm','humatrope','norditropine','saizen',
    'glucagon','glucagen',
    'thyrotrophine','thyrogen',
    'gonadotrophine','gonal-f','puregon','menopur',
    'leuproreline','enantone','eligard',
    'gosereline','goséréline','zoladex',
    'triptoreline','triptoréline','décapeptyl','decapeptyl',
    'octreotide','sandostatine',
    'parathyroïdienne','natpara','forsteo','térigant',
    'calcitonine','miacalcic',
    'desoxycorticosterone','corticostéroïde','minéralocorticoïde','mineralocorticoide','aldosterone','aldostérone',
    'thyroïde','thyroide','hormone','endocrinien','hypothyroïdie','hypothyroidie','hyperthyroïdie','hyperthyroidie',
  ]],

  // ── PÉDIATRIE ──────────────────────────────────────────────────────────────
  ['Pédiatrie', [
    'paracétamol pédiatrique','paracetamol pediatrique','paracetamol sirop','paracetamol suppositoire','doliprane pédiatrique','doliprane sirop','doliprane suppositoire','doliprane nourrisson',
    'amoxicilline sirop','amoxicilline suspension','amoxicilline pédiatrique','clamoxyl sirop',
    'paracetamol enfant','paracetamol bébé','paracetamol bebe',
    'sirop bébé','sirop bebe','solution buvable enfant',
    'pédiatrique','pediatrique','enfant','nourrisson','bébé','bebe','baby','kid','suspension buvable','poudre suspension',
    'vermifuge enfant','vermifuge pédiatrique','helmintox sirop','combantrin sirop',
    'fer pédiatrique','fer enfant','ferograd b9 enfant','fer sirop',
    'vitamine d nourrisson','adrigyl','sterogyl pédiatrique','sterogyl nourrisson',
    'fluor enfant','zymaduo','zymafluor',
    'rehydratation orale','réhydratation orale','sro','adiaril','gastrolyte','hydra',
  ]],

  // ── SOLUTÉS DE PERFUSION ───────────────────────────────────────────────────
  ['Solutés / Perf', [
    'sérum physiologique','serum physiologique','nacl 0.9','sodium chlorure','isotonique nacl','chlorure de sodium 0.9',
    'sérum glucose','serum glucose','glucose 5','glucose 10','glucose 30','glucosé','glucose hypertonique',
    'ringer','ringer lactate','ringer lactic acid','rl',
    'mannitol','mannitol 20',
    'bicarbonate','bicarbonate sodium','bicarbonate de soude',
    'gélatine','gelatine','plasmion','geloplasma','elohes',
    'amidon','hes','voluven','hyperhes',
    'albumine','albumine humaine','vialebex',
    'kabiven','smofkabiven','nutriflex','clinomel','peri olimel','olimel','aminoven','intralipid','intralipide','lipovenoes','nutrition parentérale','parentérale',
    'eau ppi','eau pour préparation','eau injection','eau distillée',
    'perfusion','soluté','soluté perfusable','iv','intraveineux','sérum','solute',
  ]],

  // ── VACCINS ────────────────────────────────────────────────────────────────
  ['Vaccins', [
    'vaccin','vaccine','vaccination','vaccinal',
    'antitétanique','tetanos','tétanos','tetanea','vat',
    'antirabique','rage','verorab','rabipur',
    'fièvre jaune','fievre jaune','stamaril','yellow fever',
    'antigrippal','grippe','influvac','vaxigrip',
    'antiméningococcique','menveo','nimenrix','menjugate',
    'antitypho','typhoide','typhim','typhim vi','typherix',
    'antipoliomyélitique','polio','imovax',
    'antitétanique','tétaract','tétanea','revaxis',
    'antitétanique antidiphtérique','revaxis','td polio',
    'hépatite a','havrix','avaxim',
    'hépatite b','engerix','genhevac','recombivax',
    'hépatite a+b','twinrix',
    'rougeole','varicelle','varilrix','varicelle vaccin',
    'mmr','rro','priorix','m-m-rvaxpro','priorix tetra',
    'pneumococcique','pneumo 23','pneumovax','prevenar','prevenar 13',
    'rotavirus','rotarix','rotateq',
    'pcv','dtcoq','dtca','infanrix','infanrix hexa','tetravac','pentavac','hexyon',
    'bcg','bcg vaccine','tuberculose',
    'hpv','papillomavirus','gardasil','cervarix','gardasil 9',
    'covid','spikevax','comirnaty','vaxzevria','janssen','astrazeneca','pfizer','moderna',
  ]],

  // ── COSMÉTIQUE / HYGIÈNE ───────────────────────────────────────────────────
  ['Cosmétique', [
    'shampoing','shampooing','shampoo',
    'savon','soap','rexona','dove','palmolive','protex','sunlight',
    'gel douche','douche','bain',
    'déodorant','deodorant','antitranspirant',
    'parfum','eau de toilette','edt','edp',
    'rouge à lèvre','rouge a levre','lipstick',
    'lait corps','lait hydratant','crème hydratante','creme hydratante','moisturizer','nivea','dove crème','dove creme',
    'lait pour bébé','lait bebe','lait nourrisson',
    'huile bébé','huile corporelle','huile coco','huile karité','huile karite',
    'shampooing bébé','shampoing bebe','no tears',
    'cosmétique','cosmetique','hygiene','hygiène','soin','soins',
    'spray hydratant','tonique','gel nettoyant','mousse nettoyante','demaquillant','démaquillant','exfoliant','gommage',
    'mousse à raser','mousse a raser','rasage','rasoir','lame',
    'brosse à dent','brosse a dent','dentifrice','colgate','signal','sensodyne','aquafresh','prodent','elmex','fluocaril','parodontax',
    'antiseptique bouche','bain de bouche','listerine','hextril','collunosol',
    'protection hygiénique','protections hygiéniques','always','tampax','tampon','serviette hygiénique',
    'lingette','wipe','lingettes bébé','baby wipes','swet','huggies',
    'couche','huggies','pampers','molfix','baby couche',
    'biberon','tetine','tétine','suce','goupillon','chauffe biberon','sterilisateur biberon','stérilisateur biberon',
    'lait infantile','lactimum','novalac','blédine','bledine','nan','nestlé bébé','enfamil','aptamil',
  ]],

  // ── AUTRE ──────────────────────────────────────────────────────────────────
  ['Autre', [
    'pansement','compresse','sparadrap','bande','bande crepe','crêpe','bande velpeau','elastoplast','urgo','urgostat','urgosterile','steristrip',
    'seringue','aiguille','cathéter','perfuseur','tubulure','transfuseur','prélèvement','prelèvement',
    'gants','glove','masque chirurgical','masque ffp2','overshoe','blouse','calots',
    'thermomètre','thermometre','tensiomètre','tensiometre','stéthoscope','stethoscope','glucomètre','glucometre','glycemie autotest','test grossesse',
    'preservatif','condom',
    'béquille','bequille','attelle','minerve','genouillère','ceinture lombaire','semelle',
    'gel hydroalcoolique','solution hydroalcoolique','hydroalc','sterillium','manugel','manuwipe',
    'matériel médical','materiel medical','equipement','test rapide','autotest','strip','réactif','reactif',
  ]],
];

// ════════════════════════════════════════════════════════════════════════════
//  CACHE D'APPRENTISSAGE (localStorage)
// ════════════════════════════════════════════════════════════════════════════
const LEARNING_CACHE_KEY = 'jp_dci_learning_v1';

function loadLearningCache(): Record<string, TherapeuticCategory> {
  try {
    const raw = localStorage.getItem(LEARNING_CACHE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

function saveLearningCache(cache: Record<string, TherapeuticCategory>) {
  try {
    localStorage.setItem(LEARNING_CACHE_KEY, JSON.stringify(cache));
  } catch {}
}

/**
 * Hash léger d'un nom de produit pour clé de cache.
 * Normalise : minuscules, sans accents, sans ponctuation, sans dosage/unité.
 */
export function hashProductName(name: string): string {
  return (name || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\b\d+\s*(mg|g|ml|µg|mcg|ui|cp|gel|gels|cps|amp|sup|sach|fl|flac|tube|caps|cpr)\b/gi, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

/**
 * Apprend un mapping nom → catégorie pour les prochaines détections.
 * Appelé quand l'utilisateur catégorise manuellement un produit.
 */
export function learnCategory(productName: string, category: TherapeuticCategory): void {
  const cache = loadLearningCache();
  const key = hashProductName(productName);
  if (key) {
    cache[key] = category;
    saveLearningCache(cache);
  }
}

/**
 * Oublie un mapping (si l'utilisateur change d'avis).
 */
export function forgetCategory(productName: string): void {
  const cache = loadLearningCache();
  const key = hashProductName(productName);
  delete cache[key];
  saveLearningCache(cache);
}

// ════════════════════════════════════════════════════════════════════════════
//  DÉTECTION PRINCIPALE
// ════════════════════════════════════════════════════════════════════════════

// Normalise le nom une fois pour le matching
function normalizeName(name: string): string {
  return (name || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Détecte la catégorie thérapeutique d'un médicament selon 3 couches :
 *   1. Cache d'apprentissage (catégorisation manuelle antérieure)
 *   2. Base DCI étendue par mots-clés
 *   3. null si rien trouvé
 */
export function detectCategory(productName: string): TherapeuticCategory | null {
  if (!productName) return null;

  // Couche 1 : cache d'apprentissage
  const cache = loadLearningCache();
  const key = hashProductName(productName);
  if (key && cache[key]) return cache[key];

  // Couche 2 : base DCI étendue
  const n = normalizeName(productName);
  for (const [cat, kws] of DCI_DATABASE) {
    for (const kw of kws) {
      if (n.includes(kw)) return cat;
    }
  }

  return null;
}

/**
 * Stats sur le cache d'apprentissage.
 */
export function getLearningStats(): { total: number; categories: Record<string, number> } {
  const cache = loadLearningCache();
  const categories: Record<string, number> = {};
  for (const cat of Object.values(cache)) {
    categories[cat] = (categories[cat] || 0) + 1;
  }
  return { total: Object.keys(cache).length, categories };
}

/**
 * Export du cache (pour backup ou partage entre pharmacies).
 */
export function exportLearningCache(): string {
  return JSON.stringify(loadLearningCache(), null, 2);
}

/**
 * Import du cache (depuis un fichier de backup).
 */
export function importLearningCache(json: string, mode: 'merge' | 'replace' = 'merge'): number {
  try {
    const incoming = JSON.parse(json) as Record<string, TherapeuticCategory>;
    const current = mode === 'replace' ? {} : loadLearningCache();
    const merged = { ...current, ...incoming };
    saveLearningCache(merged);
    return Object.keys(incoming).length;
  } catch {
    return 0;
  }
}
