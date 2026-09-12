/**
 * CozyOS — English <-> Kiswahili World Knowledge Lexicon
 * File Reference: core/modules/intelligence/knowledge/cozy-lexicon-en-sw.js
 *
 * SOURCE ARTIFACT
 *   CozyOS-English-Kiswahili-World-Knowledge-Lexicon.pdf
 *   SHA-256: 518f6f001bcd57e0ac1899ae2383b173e9525f64d9a44a3b85f4ef2aa27ff5c5
 *   Pack name: "CozyOS English-Kiswahili World Knowledge Lexicon"
 *   Pack version: "01"
 *
 * WHAT THIS FILE IS
 *   A real, additive, standalone data module: 473 vocabulary records
 *   (English term, Kiswahili term(s), category) transcribed directly
 *   from the source PDF's own tables - every record traceable to a
 *   named category section in that document. This is KNOWLEDGE
 *   (vocabulary), not INTENT - it never itself decides what a user
 *   wants; it only answers "what is X called in the other language /
 *   what category does X belong to". Intent recognition remains the
 *   exclusive responsibility of rule-based-conversational-provider.js
 *   (unmodified by this file).
 *
 * WHAT THIS FILE IS NOT
 *   - Not a new AI engine, language engine, or intent engine.
 *   - Not a second translation system - TranslationService (Domain 4C)
 *     remains the sole authority for arbitrary-text translation; this
 *     is a small, curated, static vocabulary reference only.
 *   - Not a second knowledge registry - this file only stores data and
 *     a lookup function; cozy-knowledge-registry.js (extended by this
 *     same change to add ONE new fact-getter) remains the single real
 *     integration point into the existing AI/language answer chain.
 *
 * HONESTY DISCIPLINE
 *   lookupTerm()/lookupByCategory() below never invent a translation
 *   that is not present in this exact dataset. An unknown term
 *   honestly returns null - never a guessed/fabricated translation.
 *   Every real entry is looked up by exact match (case-insensitive,
 *   trimmed) against the transcribed source data only.
 *
 * SECURITY BOUNDARY
 *   This file is vocabulary/knowledge only. It has no authorization,
 *   authentication, or action-execution capability whatsoever, and is
 *   never consulted for any security decision.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    if (window.CozyOS.Modules["cozy-lexicon-en-sw"]) return;

    const VERSION = "1.0.0";
    const PACK_NAME = "CozyOS English-Kiswahili World Knowledge Lexicon";
    const PACK_VERSION = "01";
    const SOURCE_SHA256 = "518f6f001bcd57e0ac1899ae2383b173e9525f64d9a44a3b85f4ef2aa27ff5c5";
    const SOURCE_FILE = "CozyOS-English-Kiswahili-World-Knowledge-Lexicon.pdf";

    // 473 records, transcribed directly from the source PDF's own
    // category tables - see this file's header for provenance.
    const RECORDS = Object.freeze(
[
        {
                "en": "home",
                "sw": "nyumba / nyumbani",
                "category": "home_rooms"
        },
        {
                "en": "house",
                "sw": "nyumba",
                "category": "home_rooms"
        },
        {
                "en": "homeowner",
                "sw": "mwenye nyumba",
                "category": "home_rooms"
        },
        {
                "en": "room",
                "sw": "chumba",
                "category": "home_rooms"
        },
        {
                "en": "bedroom",
                "sw": "chumba cha kulala",
                "category": "home_rooms"
        },
        {
                "en": "living room",
                "sw": "sebule",
                "category": "home_rooms"
        },
        {
                "en": "dining room",
                "sw": "chumba cha kulia",
                "category": "home_rooms"
        },
        {
                "en": "kitchen",
                "sw": "jiko",
                "category": "home_rooms"
        },
        {
                "en": "bathroom",
                "sw": "bafu",
                "category": "home_rooms"
        },
        {
                "en": "toilet",
                "sw": "choo",
                "category": "home_rooms"
        },
        {
                "en": "shower",
                "sw": "bafu la kuoga",
                "category": "home_rooms"
        },
        {
                "en": "corridor",
                "sw": "korido / njia ya ndani",
                "category": "home_rooms"
        },
        {
                "en": "balcony",
                "sw": "roshani",
                "category": "home_rooms"
        },
        {
                "en": "roof",
                "sw": "paa",
                "category": "home_rooms"
        },
        {
                "en": "ceiling",
                "sw": "dari",
                "category": "home_rooms"
        },
        {
                "en": "floor",
                "sw": "sakafu",
                "category": "home_rooms"
        },
        {
                "en": "wall",
                "sw": "ukuta",
                "category": "home_rooms"
        },
        {
                "en": "door",
                "sw": "mlango",
                "category": "home_rooms"
        },
        {
                "en": "window",
                "sw": "dirisha",
                "category": "home_rooms"
        },
        {
                "en": "gate",
                "sw": "lango / geti",
                "category": "home_rooms"
        },
        {
                "en": "stairs",
                "sw": "ngazi",
                "category": "home_rooms"
        },
        {
                "en": "yard",
                "sw": "ua",
                "category": "home_rooms"
        },
        {
                "en": "garden",
                "sw": "bustani",
                "category": "home_rooms"
        },
        {
                "en": "compound",
                "sw": "uwanja wa nyumba",
                "category": "home_rooms"
        },
        {
                "en": "garage",
                "sw": "gereji",
                "category": "home_rooms"
        },
        {
                "en": "store room",
                "sw": "chumba cha kuhifadhia vitu",
                "category": "home_rooms"
        },
        {
                "en": "key",
                "sw": "ufunguo",
                "category": "home_rooms"
        },
        {
                "en": "lock",
                "sw": "kufuli",
                "category": "home_rooms"
        },
        {
                "en": "curtain",
                "sw": "pazia",
                "category": "home_rooms"
        },
        {
                "en": "carpet",
                "sw": "zulia",
                "category": "home_rooms"
        },
        {
                "en": "mat",
                "sw": "mkeka",
                "category": "home_rooms"
        },
        {
                "en": "chair",
                "sw": "kiti",
                "category": "home_rooms"
        },
        {
                "en": "table",
                "sw": "meza",
                "category": "home_rooms"
        },
        {
                "en": "sofa",
                "sw": "sofa",
                "category": "home_rooms"
        },
        {
                "en": "bed",
                "sw": "kitanda",
                "category": "home_rooms"
        },
        {
                "en": "mattress",
                "sw": "godoro",
                "category": "home_rooms"
        },
        {
                "en": "pillow",
                "sw": "mto",
                "category": "home_rooms"
        },
        {
                "en": "blanket",
                "sw": "blanketi",
                "category": "home_rooms"
        },
        {
                "en": "sheet",
                "sw": "shuka",
                "category": "home_rooms"
        },
        {
                "en": "wardrobe",
                "sw": "kabati la nguo",
                "category": "home_rooms"
        },
        {
                "en": "cupboard",
                "sw": "kabati",
                "category": "home_rooms"
        },
        {
                "en": "shelf",
                "sw": "rafu",
                "category": "home_rooms"
        },
        {
                "en": "mirror",
                "sw": "kioo",
                "category": "home_rooms"
        },
        {
                "en": "lamp",
                "sw": "taa",
                "category": "home_rooms"
        },
        {
                "en": "bulb",
                "sw": "balbu",
                "category": "home_rooms"
        },
        {
                "en": "fan",
                "sw": "feni",
                "category": "home_rooms"
        },
        {
                "en": "air conditioner",
                "sw": "kifaa cha kupooza hewa",
                "category": "home_rooms"
        },
        {
                "en": "socket",
                "sw": "soketi",
                "category": "home_rooms"
        },
        {
                "en": "switch",
                "sw": "swichi",
                "category": "home_rooms"
        },
        {
                "en": "electricity",
                "sw": "umeme",
                "category": "home_rooms"
        },
        {
                "en": "water",
                "sw": "maji",
                "category": "home_rooms"
        },
        {
                "en": "tap",
                "sw": "bomba la maji",
                "category": "home_rooms"
        },
        {
                "en": "sink",
                "sw": "sink / beseni la kuoshea",
                "category": "home_rooms"
        },
        {
                "en": "waste bin",
                "sw": "pipa la taka",
                "category": "home_rooms"
        },
        {
                "en": "kitchen",
                "sw": "jiko",
                "category": "kitchen_food"
        },
        {
                "en": "cooking",
                "sw": "kupika",
                "category": "kitchen_food"
        },
        {
                "en": "food",
                "sw": "chakula",
                "category": "kitchen_food"
        },
        {
                "en": "meal",
                "sw": "mlo",
                "category": "kitchen_food"
        },
        {
                "en": "breakfast",
                "sw": "kifungua kinywa",
                "category": "kitchen_food"
        },
        {
                "en": "lunch",
                "sw": "chakula cha mchana",
                "category": "kitchen_food"
        },
        {
                "en": "dinner",
                "sw": "chakula cha jioni",
                "category": "kitchen_food"
        },
        {
                "en": "plate",
                "sw": "sahani",
                "category": "kitchen_food"
        },
        {
                "en": "bowl",
                "sw": "bakuli",
                "category": "kitchen_food"
        },
        {
                "en": "cup",
                "sw": "kikombe",
                "category": "kitchen_food"
        },
        {
                "en": "glass",
                "sw": "glasi",
                "category": "kitchen_food"
        },
        {
                "en": "mug",
                "sw": "kikombe kikubwa",
                "category": "kitchen_food"
        },
        {
                "en": "spoon",
                "sw": "kijiko",
                "category": "kitchen_food"
        },
        {
                "en": "fork",
                "sw": "uma",
                "category": "kitchen_food"
        },
        {
                "en": "knife",
                "sw": "kisu",
                "category": "kitchen_food"
        },
        {
                "en": "pot",
                "sw": "sufuria",
                "category": "kitchen_food"
        },
        {
                "en": "pan",
                "sw": "kikaango / sufuria bapa",
                "category": "kitchen_food"
        },
        {
                "en": "kettle",
                "sw": "birika",
                "category": "kitchen_food"
        },
        {
                "en": "thermos flask",
                "sw": "chupa ya kuhifadhia joto",
                "category": "kitchen_food"
        },
        {
                "en": "bottle",
                "sw": "chupa",
                "category": "kitchen_food"
        },
        {
                "en": "jug",
                "sw": "jagi",
                "category": "kitchen_food"
        },
        {
                "en": "tray",
                "sw": "trei",
                "category": "kitchen_food"
        },
        {
                "en": "chopping board",
                "sw": "ubao wa kukatia",
                "category": "kitchen_food"
        },
        {
                "en": "grater",
                "sw": "kikwaruzo",
                "category": "kitchen_food"
        },
        {
                "en": "strainer",
                "sw": "kichujio",
                "category": "kitchen_food"
        },
        {
                "en": "blender",
                "sw": "blenda",
                "category": "kitchen_food"
        },
        {
                "en": "fridge",
                "sw": "friji",
                "category": "kitchen_food"
        },
        {
                "en": "freezer",
                "sw": "gandisha",
                "category": "kitchen_food"
        },
        {
                "en": "oven",
                "sw": "oveni",
                "category": "kitchen_food"
        },
        {
                "en": "stove",
                "sw": "jiko",
                "category": "kitchen_food"
        },
        {
                "en": "gas cooker",
                "sw": "jiko la gesi",
                "category": "kitchen_food"
        },
        {
                "en": "microwave",
                "sw": "mashine ya microwave",
                "category": "kitchen_food"
        },
        {
                "en": "dishwasher",
                "sw": "mashine ya kuoshea vyombo",
                "category": "kitchen_food"
        },
        {
                "en": "rice cooker",
                "sw": "mashine ya kupikia wali",
                "category": "kitchen_food"
        },
        {
                "en": "bread",
                "sw": "mkate",
                "category": "kitchen_food"
        },
        {
                "en": "rice",
                "sw": "mchele / wali",
                "category": "kitchen_food"
        },
        {
                "en": "maize",
                "sw": "mahindi",
                "category": "kitchen_food"
        },
        {
                "en": "flour",
                "sw": "unga",
                "category": "kitchen_food"
        },
        {
                "en": "beans",
                "sw": "maharagwe",
                "category": "kitchen_food"
        },
        {
                "en": "peas",
                "sw": "mbaazi / njegere",
                "category": "kitchen_food"
        },
        {
                "en": "potato",
                "sw": "viazi",
                "category": "kitchen_food"
        },
        {
                "en": "sweet potato",
                "sw": "viazi vitamu",
                "category": "kitchen_food"
        },
        {
                "en": "cassava",
                "sw": "mihogo",
                "category": "kitchen_food"
        },
        {
                "en": "banana",
                "sw": "ndizi",
                "category": "kitchen_food"
        },
        {
                "en": "mango",
                "sw": "embe",
                "category": "kitchen_food"
        },
        {
                "en": "orange",
                "sw": "chungwa",
                "category": "kitchen_food"
        },
        {
                "en": "lemon",
                "sw": "limau",
                "category": "kitchen_food"
        },
        {
                "en": "pineapple",
                "sw": "nanasi",
                "category": "kitchen_food"
        },
        {
                "en": "watermelon",
                "sw": "tikiti maji",
                "category": "kitchen_food"
        },
        {
                "en": "tomato",
                "sw": "nyanya",
                "category": "kitchen_food"
        },
        {
                "en": "onion",
                "sw": "kitunguu",
                "category": "kitchen_food"
        },
        {
                "en": "garlic",
                "sw": "kitunguu saumu",
                "category": "kitchen_food"
        },
        {
                "en": "ginger",
                "sw": "tangawizi",
                "category": "kitchen_food"
        },
        {
                "en": "carrot",
                "sw": "karoti",
                "category": "kitchen_food"
        },
        {
                "en": "cabbage",
                "sw": "kabichi",
                "category": "kitchen_food"
        },
        {
                "en": "spinach",
                "sw": "mchicha / spinachi",
                "category": "kitchen_food"
        },
        {
                "en": "salt",
                "sw": "chumvi",
                "category": "kitchen_food"
        },
        {
                "en": "sugar",
                "sw": "sukari",
                "category": "kitchen_food"
        },
        {
                "en": "oil",
                "sw": "mafuta",
                "category": "kitchen_food"
        },
        {
                "en": "milk",
                "sw": "maziwa",
                "category": "kitchen_food"
        },
        {
                "en": "egg",
                "sw": "yai",
                "category": "kitchen_food"
        },
        {
                "en": "meat",
                "sw": "nyama",
                "category": "kitchen_food"
        },
        {
                "en": "beef",
                "sw": "nyama ya ng'ombe",
                "category": "kitchen_food"
        },
        {
                "en": "goat meat",
                "sw": "nyama ya mbuzi",
                "category": "kitchen_food"
        },
        {
                "en": "chicken",
                "sw": "kuku / nyama ya kuku",
                "category": "kitchen_food"
        },
        {
                "en": "fish",
                "sw": "samaki",
                "category": "kitchen_food"
        },
        {
                "en": "tea",
                "sw": "chai",
                "category": "kitchen_food"
        },
        {
                "en": "coffee",
                "sw": "kahawa",
                "category": "kitchen_food"
        },
        {
                "en": "juice",
                "sw": "juisi",
                "category": "kitchen_food"
        },
        {
                "en": "bread roll",
                "sw": "kifungu cha mkate",
                "category": "kitchen_food"
        },
        {
                "en": "animal",
                "sw": "mnyama",
                "category": "domestic_animals"
        },
        {
                "en": "pet",
                "sw": "mnyama wa kufugwa / kipenzi",
                "category": "domestic_animals"
        },
        {
                "en": "dog",
                "sw": "mbwa",
                "category": "domestic_animals"
        },
        {
                "en": "cat",
                "sw": "paka",
                "category": "domestic_animals"
        },
        {
                "en": "cow",
                "sw": "ng'ombe",
                "category": "domestic_animals"
        },
        {
                "en": "bull",
                "sw": "ng'ombe dume",
                "category": "domestic_animals"
        },
        {
                "en": "calf",
                "sw": "ndama",
                "category": "domestic_animals"
        },
        {
                "en": "goat",
                "sw": "mbuzi",
                "category": "domestic_animals"
        },
        {
                "en": "sheep",
                "sw": "kondoo",
                "category": "domestic_animals"
        },
        {
                "en": "ram",
                "sw": "kondoo dume",
                "category": "domestic_animals"
        },
        {
                "en": "lamb",
                "sw": "mwana-kondoo",
                "category": "domestic_animals"
        },
        {
                "en": "donkey",
                "sw": "punda",
                "category": "domestic_animals"
        },
        {
                "en": "horse",
                "sw": "farasi",
                "category": "domestic_animals"
        },
        {
                "en": "pig",
                "sw": "nguruwe",
                "category": "domestic_animals"
        },
        {
                "en": "rabbit",
                "sw": "sungura",
                "category": "domestic_animals"
        },
        {
                "en": "chicken",
                "sw": "kuku",
                "category": "domestic_animals"
        },
        {
                "en": "rooster",
                "sw": "jogoo",
                "category": "domestic_animals"
        },
        {
                "en": "hen",
                "sw": "kuku jike",
                "category": "domestic_animals"
        },
        {
                "en": "chick",
                "sw": "kifaranga",
                "category": "domestic_animals"
        },
        {
                "en": "duck",
                "sw": "bata",
                "category": "domestic_animals"
        },
        {
                "en": "goose",
                "sw": "bata bukini",
                "category": "domestic_animals"
        },
        {
                "en": "turkey",
                "sw": "bata mzinga",
                "category": "domestic_animals"
        },
        {
                "en": "pigeon",
                "sw": "njiwa",
                "category": "domestic_animals"
        },
        {
                "en": "bee",
                "sw": "nyuki",
                "category": "domestic_animals"
        },
        {
                "en": "beehive",
                "sw": "mzinga wa nyuki",
                "category": "domestic_animals"
        },
        {
                "en": "herd",
                "sw": "kundi la mifugo",
                "category": "domestic_animals"
        },
        {
                "en": "livestock",
                "sw": "mifugo",
                "category": "domestic_animals"
        },
        {
                "en": "farmer",
                "sw": "mkulima",
                "category": "domestic_animals"
        },
        {
                "en": "veterinarian",
                "sw": "daktari wa mifugo",
                "category": "domestic_animals"
        },
        {
                "en": "lion",
                "sw": "simba",
                "category": "wildlife"
        },
        {
                "en": "leopard",
                "sw": "chui",
                "category": "wildlife"
        },
        {
                "en": "cheetah",
                "sw": "duma",
                "category": "wildlife"
        },
        {
                "en": "elephant",
                "sw": "tembo / ndovu",
                "category": "wildlife"
        },
        {
                "en": "rhinoceros",
                "sw": "kifaru",
                "category": "wildlife"
        },
        {
                "en": "buffalo",
                "sw": "nyati",
                "category": "wildlife"
        },
        {
                "en": "giraffe",
                "sw": "twiga",
                "category": "wildlife"
        },
        {
                "en": "zebra",
                "sw": "punda milia",
                "category": "wildlife"
        },
        {
                "en": "hippopotamus",
                "sw": "kiboko",
                "category": "wildlife"
        },
        {
                "en": "warthog",
                "sw": "ngiri",
                "category": "wildlife"
        },
        {
                "en": "hyena",
                "sw": "fisi",
                "category": "wildlife"
        },
        {
                "en": "jackal",
                "sw": "mbweha",
                "category": "wildlife"
        },
        {
                "en": "wild dog",
                "sw": "mbwa mwitu",
                "category": "wildlife"
        },
        {
                "en": "baboon",
                "sw": "nyani mkubwa / nyani",
                "category": "wildlife"
        },
        {
                "en": "monkey",
                "sw": "tumbili / nyani",
                "category": "wildlife"
        },
        {
                "en": "gorilla",
                "sw": "gorila",
                "category": "wildlife"
        },
        {
                "en": "chimpanzee",
                "sw": "sokwe",
                "category": "wildlife"
        },
        {
                "en": "antelope",
                "sw": "swara",
                "category": "wildlife"
        },
        {
                "en": "gazelle",
                "sw": "paa / swala",
                "category": "wildlife"
        },
        {
                "en": "impala",
                "sw": "impala",
                "category": "wildlife"
        },
        {
                "en": "eland",
                "sw": "pofu",
                "category": "wildlife"
        },
        {
                "en": "kudu",
                "sw": "kudu",
                "category": "wildlife"
        },
        {
                "en": "oryx",
                "sw": "oryx",
                "category": "wildlife"
        },
        {
                "en": "wildebeest",
                "sw": "nyumbu",
                "category": "wildlife"
        },
        {
                "en": "zebra herd",
                "sw": "kundi la pundamilia",
                "category": "wildlife"
        },
        {
                "en": "crocodile",
                "sw": "mamba",
                "category": "wildlife"
        },
        {
                "en": "alligator",
                "sw": "mamba wa Amerika",
                "category": "wildlife"
        },
        {
                "en": "snake",
                "sw": "nyoka",
                "category": "wildlife"
        },
        {
                "en": "python",
                "sw": "chatu",
                "category": "wildlife"
        },
        {
                "en": "cobra",
                "sw": "king cobra / nyoka aina ya kobra",
                "category": "wildlife"
        },
        {
                "en": "tortoise",
                "sw": "kobe",
                "category": "wildlife"
        },
        {
                "en": "lizard",
                "sw": "mjusi",
                "category": "wildlife"
        },
        {
                "en": "chameleon",
                "sw": "kinyonga",
                "category": "wildlife"
        },
        {
                "en": "frog",
                "sw": "chura",
                "category": "wildlife"
        },
        {
                "en": "toad",
                "sw": "chura mkubwa",
                "category": "wildlife"
        },
        {
                "en": "wildlife",
                "sw": "wanyamapori",
                "category": "wildlife"
        },
        {
                "en": "forest",
                "sw": "msitu",
                "category": "wildlife"
        },
        {
                "en": "savanna",
                "sw": "savanna / nyika",
                "category": "wildlife"
        },
        {
                "en": "national park",
                "sw": "hifadhi ya taifa",
                "category": "wildlife"
        },
        {
                "en": "game reserve",
                "sw": "hifadhi ya wanyamapori",
                "category": "wildlife"
        },
        {
                "en": "bird",
                "sw": "ndege",
                "category": "birds"
        },
        {
                "en": "eagle",
                "sw": "tai",
                "category": "birds"
        },
        {
                "en": "hawk",
                "sw": "mwewe",
                "category": "birds"
        },
        {
                "en": "falcon",
                "sw": "kipanga",
                "category": "birds"
        },
        {
                "en": "vulture",
                "sw": "tumbusi",
                "category": "birds"
        },
        {
                "en": "owl",
                "sw": "bundi",
                "category": "birds"
        },
        {
                "en": "crow",
                "sw": "kunguru",
                "category": "birds"
        },
        {
                "en": "raven",
                "sw": "kunguru mkubwa",
                "category": "birds"
        },
        {
                "en": "parrot",
                "sw": "kasuku",
                "category": "birds"
        },
        {
                "en": "parakeet",
                "sw": "kasuku mdogo",
                "category": "birds"
        },
        {
                "en": "flamingo",
                "sw": "heroe / flamingo",
                "category": "birds"
        },
        {
                "en": "ostrich",
                "sw": "mbuni",
                "category": "birds"
        },
        {
                "en": "stork",
                "sw": "korongo",
                "category": "birds"
        },
        {
                "en": "crane",
                "sw": "korongo",
                "category": "birds"
        },
        {
                "en": "heron",
                "sw": "korongo / heroni",
                "category": "birds"
        },
        {
                "en": "kingfisher",
                "sw": "kingfisher / ndege mvuvi",
                "category": "birds"
        },
        {
                "en": "weaver bird",
                "sw": "ndege mfumaji",
                "category": "birds"
        },
        {
                "en": "sunbird",
                "sw": "ndege wa jua",
                "category": "birds"
        },
        {
                "en": "swallow",
                "sw": "mbayuwayu",
                "category": "birds"
        },
        {
                "en": "sparrow",
                "sw": "shomoro",
                "category": "birds"
        },
        {
                "en": "pigeon",
                "sw": "njiwa",
                "category": "birds"
        },
        {
                "en": "dove",
                "sw": "njiwa",
                "category": "birds"
        },
        {
                "en": "duck",
                "sw": "bata",
                "category": "birds"
        },
        {
                "en": "goose",
                "sw": "bata bukini",
                "category": "birds"
        },
        {
                "en": "pelican",
                "sw": "mwari",
                "category": "birds"
        },
        {
                "en": "penguin",
                "sw": "pengwini",
                "category": "birds"
        },
        {
                "en": "chicken",
                "sw": "kuku",
                "category": "birds"
        },
        {
                "en": "rooster",
                "sw": "jogoo",
                "category": "birds"
        },
        {
                "en": "hen",
                "sw": "kuku jike",
                "category": "birds"
        },
        {
                "en": "chick",
                "sw": "kifaranga",
                "category": "birds"
        },
        {
                "en": "nest",
                "sw": "kiota",
                "category": "birds"
        },
        {
                "en": "egg",
                "sw": "yai",
                "category": "birds"
        },
        {
                "en": "feather",
                "sw": "unyoya",
                "category": "birds"
        },
        {
                "en": "wing",
                "sw": "bawa",
                "category": "birds"
        },
        {
                "en": "beak",
                "sw": "mdomo wa ndege",
                "category": "birds"
        },
        {
                "en": "birdsong",
                "sw": "mlio wa ndege",
                "category": "birds"
        },
        {
                "en": "fish",
                "sw": "samaki",
                "category": "fish_aquatic"
        },
        {
                "en": "fishing",
                "sw": "uvuvi",
                "category": "fish_aquatic"
        },
        {
                "en": "fisherman",
                "sw": "mvuvi",
                "category": "fish_aquatic"
        },
        {
                "en": "fishing boat",
                "sw": "mashua ya uvuvi",
                "category": "fish_aquatic"
        },
        {
                "en": "net",
                "sw": "wavu",
                "category": "fish_aquatic"
        },
        {
                "en": "hook",
                "sw": "ndoano",
                "category": "fish_aquatic"
        },
        {
                "en": "bait",
                "sw": "chambo",
                "category": "fish_aquatic"
        },
        {
                "en": "shark",
                "sw": "papa",
                "category": "fish_aquatic"
        },
        {
                "en": "whale",
                "sw": "nyangumi",
                "category": "fish_aquatic"
        },
        {
                "en": "dolphin",
                "sw": "pomboo",
                "category": "fish_aquatic"
        },
        {
                "en": "ray",
                "sw": "taa / samaki taa",
                "category": "fish_aquatic"
        },
        {
                "en": "tuna",
                "sw": "jodari",
                "category": "fish_aquatic"
        },
        {
                "en": "sardine",
                "sw": "dagaa",
                "category": "fish_aquatic"
        },
        {
                "en": "tilapia",
                "sw": "sato",
                "category": "fish_aquatic"
        },
        {
                "en": "catfish",
                "sw": "kambale",
                "category": "fish_aquatic"
        },
        {
                "en": "salmon",
                "sw": "samaki aina ya salmoni",
                "category": "fish_aquatic"
        },
        {
                "en": "trout",
                "sw": "trout",
                "category": "fish_aquatic"
        },
        {
                "en": "eel",
                "sw": "mkunga",
                "category": "fish_aquatic"
        },
        {
                "en": "octopus",
                "sw": "pweza",
                "category": "fish_aquatic"
        },
        {
                "en": "squid",
                "sw": "ngisi",
                "category": "fish_aquatic"
        },
        {
                "en": "crab",
                "sw": "kaa",
                "category": "fish_aquatic"
        },
        {
                "en": "lobster",
                "sw": "kamba mkubwa",
                "category": "fish_aquatic"
        },
        {
                "en": "prawn",
                "sw": "kamba",
                "category": "fish_aquatic"
        },
        {
                "en": "shrimp",
                "sw": "kamba mdogo",
                "category": "fish_aquatic"
        },
        {
                "en": "jellyfish",
                "sw": "jellyfish / samaki wa sumu aina ya jellyfish",
                "category": "fish_aquatic"
        },
        {
                "en": "starfish",
                "sw": "nyota ya bahari",
                "category": "fish_aquatic"
        },
        {
                "en": "seahorse",
                "sw": "farasi wa bahari",
                "category": "fish_aquatic"
        },
        {
                "en": "sea turtle",
                "sw": "kobe wa baharini",
                "category": "fish_aquatic"
        },
        {
                "en": "coral",
                "sw": "matumbawe",
                "category": "fish_aquatic"
        },
        {
                "en": "shell",
                "sw": "gamba",
                "category": "fish_aquatic"
        },
        {
                "en": "ocean",
                "sw": "bahari",
                "category": "fish_aquatic"
        },
        {
                "en": "sea",
                "sw": "bahari",
                "category": "fish_aquatic"
        },
        {
                "en": "lake",
                "sw": "ziwa",
                "category": "fish_aquatic"
        },
        {
                "en": "river",
                "sw": "mto",
                "category": "fish_aquatic"
        },
        {
                "en": "pond",
                "sw": "bwawa",
                "category": "fish_aquatic"
        },
        {
                "en": "aquarium",
                "sw": "akwarimu",
                "category": "fish_aquatic"
        },
        {
                "en": "water",
                "sw": "maji",
                "category": "fish_aquatic"
        },
        {
                "en": "insect",
                "sw": "mdudu",
                "category": "insects_small_creatures"
        },
        {
                "en": "ant",
                "sw": "siafu / chungu",
                "category": "insects_small_creatures"
        },
        {
                "en": "termite",
                "sw": "mchwa",
                "category": "insects_small_creatures"
        },
        {
                "en": "mosquito",
                "sw": "mbu",
                "category": "insects_small_creatures"
        },
        {
                "en": "fly",
                "sw": "nzi",
                "category": "insects_small_creatures"
        },
        {
                "en": "housefly",
                "sw": "nzi wa kawaida",
                "category": "insects_small_creatures"
        },
        {
                "en": "cockroach",
                "sw": "mende",
                "category": "insects_small_creatures"
        },
        {
                "en": "butterfly",
                "sw": "kipepeo",
                "category": "insects_small_creatures"
        },
        {
                "en": "moth",
                "sw": "nondo",
                "category": "insects_small_creatures"
        },
        {
                "en": "bee",
                "sw": "nyuki",
                "category": "insects_small_creatures"
        },
        {
                "en": "wasp",
                "sw": "nyigu",
                "category": "insects_small_creatures"
        },
        {
                "en": "hornet",
                "sw": "nyigu mkubwa",
                "category": "insects_small_creatures"
        },
        {
                "en": "dragonfly",
                "sw": "kereng'ende",
                "category": "insects_small_creatures"
        },
        {
                "en": "grasshopper",
                "sw": "panzi",
                "category": "insects_small_creatures"
        },
        {
                "en": "locust",
                "sw": "nzige",
                "category": "insects_small_creatures"
        },
        {
                "en": "cricket",
                "sw": "senene / panzi wa usiku",
                "category": "insects_small_creatures"
        },
        {
                "en": "beetle",
                "sw": "mende wa aina ya beetle",
                "category": "insects_small_creatures"
        },
        {
                "en": "ladybird",
                "sw": "kunguni wa bustani",
                "category": "insects_small_creatures"
        },
        {
                "en": "spider",
                "sw": "buibui",
                "category": "insects_small_creatures"
        },
        {
                "en": "scorpion",
                "sw": "nge",
                "category": "insects_small_creatures"
        },
        {
                "en": "tick",
                "sw": "kupe",
                "category": "insects_small_creatures"
        },
        {
                "en": "flea",
                "sw": "kiroboto",
                "category": "insects_small_creatures"
        },
        {
                "en": "louse",
                "sw": "chawa",
                "category": "insects_small_creatures"
        },
        {
                "en": "caterpillar",
                "sw": "kiwavi",
                "category": "insects_small_creatures"
        },
        {
                "en": "worm",
                "sw": "mnyoo",
                "category": "insects_small_creatures"
        },
        {
                "en": "centipede",
                "sw": "jongoo",
                "category": "insects_small_creatures"
        },
        {
                "en": "millipede",
                "sw": "jongoo wa magamba",
                "category": "insects_small_creatures"
        },
        {
                "en": "snail",
                "sw": "konokono",
                "category": "insects_small_creatures"
        },
        {
                "en": "slug",
                "sw": "konokono asiye na gamba",
                "category": "insects_small_creatures"
        },
        {
                "en": "pest",
                "sw": "mdudu waharibifu / kiumbe mharibifu",
                "category": "insects_small_creatures"
        },
        {
                "en": "car",
                "sw": "gari",
                "category": "vehicles_transport"
        },
        {
                "en": "vehicle",
                "sw": "gari / chombo cha usafiri",
                "category": "vehicles_transport"
        },
        {
                "en": "bus",
                "sw": "basi",
                "category": "vehicles_transport"
        },
        {
                "en": "minibus",
                "sw": "matatu",
                "category": "vehicles_transport"
        },
        {
                "en": "taxi",
                "sw": "teksi",
                "category": "vehicles_transport"
        },
        {
                "en": "motorcycle",
                "sw": "pikipiki",
                "category": "vehicles_transport"
        },
        {
                "en": "bicycle",
                "sw": "baiskeli",
                "category": "vehicles_transport"
        },
        {
                "en": "truck",
                "sw": "lori",
                "category": "vehicles_transport"
        },
        {
                "en": "pickup truck",
                "sw": "gari la mizigo / pickup",
                "category": "vehicles_transport"
        },
        {
                "en": "van",
                "sw": "van / gari dogo la mizigo",
                "category": "vehicles_transport"
        },
        {
                "en": "ambulance",
                "sw": "ambulansi",
                "category": "vehicles_transport"
        },
        {
                "en": "fire engine",
                "sw": "gari la zimamoto",
                "category": "vehicles_transport"
        },
        {
                "en": "police car",
                "sw": "gari la polisi",
                "category": "vehicles_transport"
        },
        {
                "en": "tractor",
                "sw": "trekta",
                "category": "vehicles_transport"
        },
        {
                "en": "train",
                "sw": "treni",
                "category": "vehicles_transport"
        },
        {
                "en": "railway",
                "sw": "reli / njia ya reli",
                "category": "vehicles_transport"
        },
        {
                "en": "locomotive",
                "sw": "treni ya kuvuta",
                "category": "vehicles_transport"
        },
        {
                "en": "airplane",
                "sw": "ndege",
                "category": "vehicles_transport"
        },
        {
                "en": "helicopter",
                "sw": "helikopta",
                "category": "vehicles_transport"
        },
        {
                "en": "drone",
                "sw": "droni",
                "category": "vehicles_transport"
        },
        {
                "en": "airport",
                "sw": "uwanja wa ndege",
                "category": "vehicles_transport"
        },
        {
                "en": "ship",
                "sw": "meli",
                "category": "vehicles_transport"
        },
        {
                "en": "boat",
                "sw": "mashua",
                "category": "vehicles_transport"
        },
        {
                "en": "yacht",
                "sw": "yati / jahazi la starehe",
                "category": "vehicles_transport"
        },
        {
                "en": "ferry",
                "sw": "feri",
                "category": "vehicles_transport"
        },
        {
                "en": "canoe",
                "sw": "mtumbwi",
                "category": "vehicles_transport"
        },
        {
                "en": "sailboat",
                "sw": "mashua ya tanga",
                "category": "vehicles_transport"
        },
        {
                "en": "submarine",
                "sw": "manowari",
                "category": "vehicles_transport"
        },
        {
                "en": "wheel",
                "sw": "gurudumu",
                "category": "vehicles_transport"
        },
        {
                "en": "tyre",
                "sw": "tairi",
                "category": "vehicles_transport"
        },
        {
                "en": "engine",
                "sw": "injini",
                "category": "vehicles_transport"
        },
        {
                "en": "brake",
                "sw": "breki",
                "category": "vehicles_transport"
        },
        {
                "en": "steering wheel",
                "sw": "usukani",
                "category": "vehicles_transport"
        },
        {
                "en": "seat belt",
                "sw": "mkanda wa usalama",
                "category": "vehicles_transport"
        },
        {
                "en": "fuel",
                "sw": "mafuta ya gari",
                "category": "vehicles_transport"
        },
        {
                "en": "petrol",
                "sw": "petroli",
                "category": "vehicles_transport"
        },
        {
                "en": "diesel",
                "sw": "dizeli",
                "category": "vehicles_transport"
        },
        {
                "en": "electric vehicle",
                "sw": "gari la umeme",
                "category": "vehicles_transport"
        },
        {
                "en": "charging station",
                "sw": "kituo cha kuchaji",
                "category": "vehicles_transport"
        },
        {
                "en": "road",
                "sw": "barabara",
                "category": "vehicles_transport"
        },
        {
                "en": "bridge",
                "sw": "daraja",
                "category": "vehicles_transport"
        },
        {
                "en": "traffic",
                "sw": "msongamano wa magari",
                "category": "vehicles_transport"
        },
        {
                "en": "traffic light",
                "sw": "taa za barabarani",
                "category": "vehicles_transport"
        },
        {
                "en": "parking",
                "sw": "maegesho",
                "category": "vehicles_transport"
        },
        {
                "en": "driver",
                "sw": "dereva",
                "category": "vehicles_transport"
        },
        {
                "en": "passenger",
                "sw": "abiria",
                "category": "vehicles_transport"
        },
        {
                "en": "ticket",
                "sw": "tiketi",
                "category": "vehicles_transport"
        },
        {
                "en": "person",
                "sw": "mtu",
                "category": "people_family_daily"
        },
        {
                "en": "people",
                "sw": "watu",
                "category": "people_family_daily"
        },
        {
                "en": "man",
                "sw": "mwanaume",
                "category": "people_family_daily"
        },
        {
                "en": "woman",
                "sw": "mwanamke",
                "category": "people_family_daily"
        },
        {
                "en": "child",
                "sw": "mtoto",
                "category": "people_family_daily"
        },
        {
                "en": "boy",
                "sw": "mvulana",
                "category": "people_family_daily"
        },
        {
                "en": "girl",
                "sw": "msichana",
                "category": "people_family_daily"
        },
        {
                "en": "baby",
                "sw": "mtoto mchanga",
                "category": "people_family_daily"
        },
        {
                "en": "father",
                "sw": "baba",
                "category": "people_family_daily"
        },
        {
                "en": "mother",
                "sw": "mama",
                "category": "people_family_daily"
        },
        {
                "en": "parent",
                "sw": "mzazi",
                "category": "people_family_daily"
        },
        {
                "en": "son",
                "sw": "mwana wa kiume",
                "category": "people_family_daily"
        },
        {
                "en": "daughter",
                "sw": "mwana wa kike",
                "category": "people_family_daily"
        },
        {
                "en": "brother",
                "sw": "kaka / ndugu wa kiume",
                "category": "people_family_daily"
        },
        {
                "en": "sister",
                "sw": "dada / ndugu wa kike",
                "category": "people_family_daily"
        },
        {
                "en": "husband",
                "sw": "mume",
                "category": "people_family_daily"
        },
        {
                "en": "wife",
                "sw": "mke",
                "category": "people_family_daily"
        },
        {
                "en": "family",
                "sw": "familia",
                "category": "people_family_daily"
        },
        {
                "en": "friend",
                "sw": "rafiki",
                "category": "people_family_daily"
        },
        {
                "en": "neighbor",
                "sw": "jirani",
                "category": "people_family_daily"
        },
        {
                "en": "customer",
                "sw": "mteja",
                "category": "people_family_daily"
        },
        {
                "en": "worker",
                "sw": "mfanyakazi",
                "category": "people_family_daily"
        },
        {
                "en": "teacher",
                "sw": "mwalimu",
                "category": "people_family_daily"
        },
        {
                "en": "student",
                "sw": "mwanafunzi",
                "category": "people_family_daily"
        },
        {
                "en": "doctor",
                "sw": "daktari",
                "category": "people_family_daily"
        },
        {
                "en": "nurse",
                "sw": "muuguzi",
                "category": "people_family_daily"
        },
        {
                "en": "pastor",
                "sw": "mchungaji",
                "category": "people_family_daily"
        },
        {
                "en": "priest",
                "sw": "padri",
                "category": "people_family_daily"
        },
        {
                "en": "farmer",
                "sw": "mkulima",
                "category": "people_family_daily"
        },
        {
                "en": "driver",
                "sw": "dereva",
                "category": "people_family_daily"
        },
        {
                "en": "seller",
                "sw": "muuzaji",
                "category": "people_family_daily"
        },
        {
                "en": "buyer",
                "sw": "mnunuzi",
                "category": "people_family_daily"
        },
        {
                "en": "manager",
                "sw": "menaja",
                "category": "people_family_daily"
        },
        {
                "en": "owner",
                "sw": "mmiliki",
                "category": "people_family_daily"
        },
        {
                "en": "phone",
                "sw": "simu",
                "category": "technology_objects"
        },
        {
                "en": "smartphone",
                "sw": "simu janja",
                "category": "technology_objects"
        },
        {
                "en": "computer",
                "sw": "kompyuta",
                "category": "technology_objects"
        },
        {
                "en": "laptop",
                "sw": "kompyuta mpakato",
                "category": "technology_objects"
        },
        {
                "en": "tablet",
                "sw": "kompyuta kibao",
                "category": "technology_objects"
        },
        {
                "en": "keyboard",
                "sw": "kibodi",
                "category": "technology_objects"
        },
        {
                "en": "mouse",
                "sw": "kipanya",
                "category": "technology_objects"
        },
        {
                "en": "screen",
                "sw": "skrini",
                "category": "technology_objects"
        },
        {
                "en": "camera",
                "sw": "kamera",
                "category": "technology_objects"
        },
        {
                "en": "microphone",
                "sw": "kipaza sauti",
                "category": "technology_objects"
        },
        {
                "en": "speaker",
                "sw": "spika",
                "category": "technology_objects"
        },
        {
                "en": "headphones",
                "sw": "vifaa vya masikioni",
                "category": "technology_objects"
        },
        {
                "en": "charger",
                "sw": "chaja",
                "category": "technology_objects"
        },
        {
                "en": "battery",
                "sw": "betri",
                "category": "technology_objects"
        },
        {
                "en": "cable",
                "sw": "kebo",
                "category": "technology_objects"
        },
        {
                "en": "internet",
                "sw": "intaneti",
                "category": "technology_objects"
        },
        {
                "en": "website",
                "sw": "tovuti",
                "category": "technology_objects"
        },
        {
                "en": "application",
                "sw": "programu tumizi",
                "category": "technology_objects"
        },
        {
                "en": "app",
                "sw": "programu",
                "category": "technology_objects"
        },
        {
                "en": "password",
                "sw": "nenosiri",
                "category": "technology_objects"
        },
        {
                "en": "account",
                "sw": "akaunti",
                "category": "technology_objects"
        },
        {
                "en": "message",
                "sw": "ujumbe",
                "category": "technology_objects"
        },
        {
                "en": "email",
                "sw": "barua pepe",
                "category": "technology_objects"
        },
        {
                "en": "file",
                "sw": "faili",
                "category": "technology_objects"
        },
        {
                "en": "photo",
                "sw": "picha",
                "category": "technology_objects"
        },
        {
                "en": "video",
                "sw": "video",
                "category": "technology_objects"
        },
        {
                "en": "document",
                "sw": "hati",
                "category": "technology_objects"
        },
        {
                "en": "printer",
                "sw": "printa",
                "category": "technology_objects"
        },
        {
                "en": "scanner",
                "sw": "skana",
                "category": "technology_objects"
        },
        {
                "en": "router",
                "sw": "ruta",
                "category": "technology_objects"
        },
        {
                "en": "artificial intelligence",
                "sw": "akili bandia",
                "category": "technology_objects"
        },
        {
                "en": "voice assistant",
                "sw": "msaidizi wa sauti",
                "category": "technology_objects"
        },
        {
                "en": "translation",
                "sw": "tafsiri",
                "category": "technology_objects"
        },
        {
                "en": "language",
                "sw": "lugha",
                "category": "technology_objects"
        },
        {
                "en": "question",
                "sw": "swali",
                "category": "technology_objects"
        },
        {
                "en": "answer",
                "sw": "jibu",
                "category": "technology_objects"
        },
        {
                "en": "go",
                "sw": "kwenda",
                "category": "basic_actions_concepts"
        },
        {
                "en": "come",
                "sw": "kuja",
                "category": "basic_actions_concepts"
        },
        {
                "en": "eat",
                "sw": "kula",
                "category": "basic_actions_concepts"
        },
        {
                "en": "drink",
                "sw": "kunywa",
                "category": "basic_actions_concepts"
        },
        {
                "en": "sleep",
                "sw": "kulala",
                "category": "basic_actions_concepts"
        },
        {
                "en": "wake up",
                "sw": "kuamka",
                "category": "basic_actions_concepts"
        },
        {
                "en": "sit",
                "sw": "kukaa",
                "category": "basic_actions_concepts"
        },
        {
                "en": "stand",
                "sw": "kusimama",
                "category": "basic_actions_concepts"
        },
        {
                "en": "walk",
                "sw": "kutembea",
                "category": "basic_actions_concepts"
        },
        {
                "en": "run",
                "sw": "kukimbia",
                "category": "basic_actions_concepts"
        },
        {
                "en": "drive",
                "sw": "kuendesha",
                "category": "basic_actions_concepts"
        },
        {
                "en": "buy",
                "sw": "kununua",
                "category": "basic_actions_concepts"
        },
        {
                "en": "sell",
                "sw": "kuuza",
                "category": "basic_actions_concepts"
        },
        {
                "en": "pay",
                "sw": "kulipa",
                "category": "basic_actions_concepts"
        },
        {
                "en": "send",
                "sw": "kutuma",
                "category": "basic_actions_concepts"
        },
        {
                "en": "receive",
                "sw": "kupokea",
                "category": "basic_actions_concepts"
        },
        {
                "en": "open",
                "sw": "kufungua",
                "category": "basic_actions_concepts"
        },
        {
                "en": "close",
                "sw": "kufunga",
                "category": "basic_actions_concepts"
        },
        {
                "en": "start",
                "sw": "kuanza",
                "category": "basic_actions_concepts"
        },
        {
                "en": "stop",
                "sw": "kusimamisha / kuacha",
                "category": "basic_actions_concepts"
        },
        {
                "en": "help",
                "sw": "kusaidia",
                "category": "basic_actions_concepts"
        },
        {
                "en": "ask",
                "sw": "kuuliza",
                "category": "basic_actions_concepts"
        },
        {
                "en": "answer",
                "sw": "kujibu",
                "category": "basic_actions_concepts"
        },
        {
                "en": "read",
                "sw": "kusoma",
                "category": "basic_actions_concepts"
        },
        {
                "en": "write",
                "sw": "kuandika",
                "category": "basic_actions_concepts"
        },
        {
                "en": "listen",
                "sw": "kusikiliza",
                "category": "basic_actions_concepts"
        },
        {
                "en": "speak",
                "sw": "kuongea",
                "category": "basic_actions_concepts"
        },
        {
                "en": "learn",
                "sw": "kujifunza",
                "category": "basic_actions_concepts"
        },
        {
                "en": "teach",
                "sw": "kufundisha",
                "category": "basic_actions_concepts"
        },
        {
                "en": "understand",
                "sw": "kuelewa",
                "category": "basic_actions_concepts"
        },
        {
                "en": "know",
                "sw": "kujua",
                "category": "basic_actions_concepts"
        },
        {
                "en": "want",
                "sw": "kutaka",
                "category": "basic_actions_concepts"
        },
        {
                "en": "need",
                "sw": "kuhitaji",
                "category": "basic_actions_concepts"
        },
        {
                "en": "like",
                "sw": "kupenda",
                "category": "basic_actions_concepts"
        },
        {
                "en": "find",
                "sw": "kupata / kutafuta",
                "category": "basic_actions_concepts"
        },
        {
                "en": "search",
                "sw": "kutafuta",
                "category": "basic_actions_concepts"
        },
        {
                "en": "show",
                "sw": "kuonyesha",
                "category": "basic_actions_concepts"
        },
        {
                "en": "tell",
                "sw": "kuwaambia",
                "category": "basic_actions_concepts"
        },
        {
                "en": "today",
                "sw": "leo",
                "category": "basic_actions_concepts"
        },
        {
                "en": "tomorrow",
                "sw": "kesho",
                "category": "basic_actions_concepts"
        },
        {
                "en": "yesterday",
                "sw": "jana",
                "category": "basic_actions_concepts"
        },
        {
                "en": "now",
                "sw": "sasa",
                "category": "basic_actions_concepts"
        },
        {
                "en": "later",
                "sw": "baadaye",
                "category": "basic_actions_concepts"
        },
        {
                "en": "where",
                "sw": "wapi",
                "category": "basic_actions_concepts"
        },
        {
                "en": "what",
                "sw": "nini",
                "category": "basic_actions_concepts"
        },
        {
                "en": "who",
                "sw": "nani",
                "category": "basic_actions_concepts"
        },
        {
                "en": "when",
                "sw": "lini",
                "category": "basic_actions_concepts"
        },
        {
                "en": "why",
                "sw": "kwa nini",
                "category": "basic_actions_concepts"
        },
        {
                "en": "how",
                "sw": "vipi",
                "category": "basic_actions_concepts"
        },
        {
                "en": "yes",
                "sw": "ndiyo",
                "category": "basic_actions_concepts"
        },
        {
                "en": "no",
                "sw": "hapana",
                "category": "basic_actions_concepts"
        },
        {
                "en": "please",
                "sw": "tafadhali",
                "category": "basic_actions_concepts"
        },
        {
                "en": "thank you",
                "sw": "asante",
                "category": "basic_actions_concepts"
        },
        {
                "en": "sorry",
                "sw": "samahani",
                "category": "basic_actions_concepts"
        },
        {
                "en": "good",
                "sw": "nzuri",
                "category": "basic_actions_concepts"
        },
        {
                "en": "bad",
                "sw": "mbaya",
                "category": "basic_actions_concepts"
        },
        {
                "en": "big",
                "sw": "kubwa",
                "category": "basic_actions_concepts"
        },
        {
                "en": "small",
                "sw": "ndogo",
                "category": "basic_actions_concepts"
        },
        {
                "en": "new",
                "sw": "mpya",
                "category": "basic_actions_concepts"
        },
        {
                "en": "old",
                "sw": "ya zamani",
                "category": "basic_actions_concepts"
        }
]    );

    function normalize(term) {
        return (typeof term === "string" ? term : "").trim().toLowerCase();
    }

    /**
     * lookupTerm(term, sourceLanguage)
     *   sourceLanguage: "en" or "sw". Returns the real, matching
     *   record(s) - a term can have more than one real category (e.g.
     *   "chicken" is both a domestic animal and a food item in the
     *   real source data) - or an empty array if genuinely not found.
     *   Never fabricates a translation for an unknown term.
     */
    function lookupTerm(term, sourceLanguage) {
        const needle = normalize(term);
        if (!needle) return [];
        if (sourceLanguage === "sw") {
            return RECORDS.filter((r) => r.sw.toLowerCase().split(/\s*\/\s*/).some((alt) => alt.trim() === needle));
        }
        return RECORDS.filter((r) => r.en.toLowerCase() === needle);
    }

    /** listCategories() — the real, distinct category names present in this dataset. */
    function listCategories() {
        return Array.from(new Set(RECORDS.map((r) => r.category)));
    }

    /** lookupByCategory(category) — every real record in a given category. */
    function lookupByCategory(category) {
        const needle = normalize(category);
        return RECORDS.filter((r) => r.category.toLowerCase() === needle);
    }

    /** getRecordCount() — real, current count (must stay 473 unless this file is genuinely re-versioned). */
    function getRecordCount() { return RECORDS.length; }

    window.CozyOS.CozyLexiconEnSw = Object.freeze({
        getVersion: () => VERSION,
        getPackName: () => PACK_NAME,
        getPackVersion: () => PACK_VERSION,
        getSourceSha256: () => SOURCE_SHA256,
        getSourceFile: () => SOURCE_FILE,
        getRecordCount,
        listCategories,
        lookupTerm,
        lookupByCategory,
    });

    window.CozyOS.Modules["cozy-lexicon-en-sw"] = Object.freeze({
        version: VERSION,
        description: "CozyOS English<->Kiswahili World Knowledge Lexicon (Pack 01, real, transcribed vocabulary data) - consumed by cozy-knowledge-registry.js's lookupLexiconTermFact(). Never itself performs intent recognition or translation of arbitrary text.",
    });
})();
