import type { NutrientsPer100g } from './nutrition'

/* Approximate values per 100 g, typical of USDA FoodData Central entries. Estimates for a household card, not a lab.
   Columns: calories, protein g, carbs g, fiber g, fat g, sodium mg, added sugar g. */
const n = (calories: number, proteinG: number, carbsG: number, fiberG: number, fatG: number, sodiumMg: number, addedSugarG = 0): NutrientsPer100g => ({ calories, proteinG, carbsG, fiberG, fatG, sodiumMg, addedSugarG })

export const BUILTIN_NUTRIENTS: Record<string, NutrientsPer100g> = {
  'chicken thigh': n(209, 18, 0, 0, 15, 84), 'boneless skinless chicken thigh': n(177, 19, 0, 0, 11, 95), 'chicken breast': n(165, 31, 0, 0, 3.6, 74),
  'cooked chicken': n(190, 29, 0, 0, 7, 80), 'ground beef': n(254, 17, 0, 0, 20, 67), 'beef brisket': n(250, 18, 0, 0, 19, 60), 'beef chuck roast': n(240, 20, 0, 0, 17, 60),
  'pork shoulder': n(242, 18, 0, 0, 18, 60), 'andouille sausage': n(300, 15, 2, 0, 26, 1000), 'breakfast sausage': n(330, 13, 1, 0, 30, 800), bacon: n(540, 37, 1, 0, 42, 1700),
  shrimp: n(99, 24, 0, 0, 0.3, 111), salmon: n(208, 20, 0, 0, 13, 59), 'tuna canned': n(116, 26, 0, 0, 1, 320),
  'white rice': n(365, 7, 80, 1.3, 0.7, 5), rice: n(365, 7, 80, 1.3, 0.7, 5), 'cooked rice': n(130, 2.7, 28, 0.4, 0.3, 1), pasta: n(371, 13, 75, 3, 1.5, 6),
  'black bean': n(91, 6, 16, 6, 0.4, 240), 'kidney bean': n(84, 6, 15, 5, 0.3, 230), 'great northern bean': n(90, 6, 16, 5, 0.3, 230), chickpea: n(100, 5, 17, 5, 1.5, 230),
  'dried red bean': n(337, 24, 61, 25, 1, 12), lentil: n(352, 25, 63, 11, 1, 6),
  'yellow onion': n(40, 1.1, 9, 1.7, 0.1, 4), onion: n(40, 1.1, 9, 1.7, 0.1, 4), garlic: n(149, 6, 33, 2, 0.5, 17), carrot: n(41, 0.9, 10, 2.8, 0.2, 69), 'baby carrot': n(35, 0.6, 8, 2.9, 0.1, 78),
  celery: n(14, 0.7, 3, 1.6, 0.2, 80), potato: n(77, 2, 17, 2.2, 0.1, 6), 'baby potato': n(77, 2, 17, 2.2, 0.1, 6), 'sweet potato': n(86, 1.6, 20, 3, 0.1, 55),
  'bell pepper': n(31, 1, 6, 2, 0.3, 4), tomato: n(18, 0.9, 3.9, 1.2, 0.2, 5), 'diced tomato': n(21, 1, 4.5, 1, 0.1, 130), 'crushed tomato': n(32, 1.6, 7, 1.9, 0.3, 130), 'tomato paste': n(82, 4.3, 19, 4, 0.5, 60), 'tomato sauce': n(24, 1.3, 5.3, 1.5, 0.3, 250),
  broccoli: n(34, 2.8, 7, 2.6, 0.4, 33), 'frozen broccoli': n(26, 2.8, 5, 3, 0.3, 24), spinach: n(23, 2.9, 3.6, 2.2, 0.4, 79), 'frozen spinach': n(29, 3.6, 4, 2.9, 0.6, 74), kale: n(49, 4.3, 9, 3.6, 0.9, 38),
  corn: n(86, 3.3, 19, 2.7, 1.2, 15), 'frozen corn': n(88, 3, 21, 2.4, 0.8, 3), 'corn on the cob': n(86, 3.3, 19, 2.7, 1.2, 15), 'frozen pea': n(77, 5, 14, 5, 0.4, 108), pea: n(81, 5.4, 14, 5.7, 0.4, 5), 'green bean': n(31, 1.8, 7, 2.7, 0.2, 6), 'frozen mixed vegetable': n(65, 3, 13, 4, 0.5, 60),
  'green chile': n(21, 0.9, 5, 1.2, 0.1, 400), pepperoncini: n(20, 1, 4, 1, 0.3, 1100), lemon: n(29, 1.1, 9, 2.8, 0.3, 2), lime: n(30, 0.7, 11, 2.8, 0.2, 2),
  cheddar: n(403, 23, 1.3, 0, 33, 621), 'sharp cheddar': n(403, 23, 1.3, 0, 33, 621), 'shredded cheddar': n(403, 23, 1.3, 0, 33, 621), mozzarella: n(280, 28, 3, 0, 17, 627), parmesan: n(431, 38, 4, 0, 29, 1529),
  'cream cheese': n(342, 6, 4, 0, 34, 321), butter: n(717, 0.9, 0.1, 0, 81, 643), 'olive oil': n(884, 0, 0, 0, 100, 2), 'vegetable oil': n(884, 0, 0, 0, 100, 0),
  milk: n(61, 3.2, 4.8, 0, 3.3, 43), 'half and half': n(131, 3, 4.3, 0, 11.5, 41), 'heavy cream': n(340, 2.8, 2.8, 0, 36, 27), 'sour cream': n(198, 2.4, 4.6, 0, 19, 31), yogurt: n(61, 3.5, 4.7, 0, 3.3, 46),
  egg: n(143, 13, 0.7, 0, 9.5, 142), 'all-purpose flour': n(364, 10, 76, 2.7, 1, 2), flour: n(364, 10, 76, 2.7, 1, 2), sugar: n(387, 0, 100, 0, 0, 1, 100), 'brown sugar': n(380, 0, 98, 0, 0, 28, 97), honey: n(304, 0.3, 82, 0.2, 0, 4, 82),
  bread: n(265, 9, 49, 2.7, 3.2, 491), 'flour tortilla': n(312, 8, 51, 3, 8, 580), tortilla: n(312, 8, 51, 3, 8, 580), 'tortilla chip': n(489, 7, 65, 5, 23, 450), oat: n(389, 17, 66, 10.6, 7, 2), 'frozen hash brown': n(163, 2, 22, 2, 7, 320),
  'chicken broth': n(7, 1, 0.5, 0, 0.2, 340), 'beef broth': n(7, 1.2, 0.3, 0, 0.2, 350), 'soy sauce': n(53, 8, 5, 0.8, 0.6, 5493), salsa: n(36, 1.5, 7, 1.5, 0.2, 430), ketchup: n(101, 1, 27, 0.3, 0.1, 907, 21), mayonnaise: n(680, 1, 0.6, 0, 75, 635), mustard: n(66, 4, 5, 3, 4, 1135),
  salt: n(0, 0, 0, 0, 0, 38758), 'black pepper': n(251, 10, 64, 25, 3.3, 20), cumin: n(375, 18, 44, 10.5, 22, 168), 'ground cumin': n(375, 18, 44, 10.5, 22, 168), 'chili powder': n(282, 13, 50, 35, 14, 1640), paprika: n(282, 14, 54, 35, 13, 68),
  oregano: n(265, 9, 69, 42, 4.3, 25), 'dried oregano': n(265, 9, 69, 42, 4.3, 25), 'dried basil': n(233, 23, 48, 38, 4, 76), 'dried thyme': n(276, 9, 64, 37, 7.4, 55), cinnamon: n(247, 4, 81, 53, 1.2, 10), 'garlic powder': n(331, 17, 73, 9, 0.7, 60),
  'cajun seasoning': n(250, 10, 50, 20, 5, 15000), 'bay leaf': n(313, 8, 75, 26, 8, 23), 'ranch seasoning': n(330, 5, 60, 2, 8, 13000), 'au jus mix': n(300, 10, 55, 1, 5, 14000), 'red curry paste': n(120, 3, 20, 5, 3, 3500), 'fish sauce': n(35, 5, 4, 0, 0, 7800),
  'lime juice': n(25, 0.4, 8.4, 0.4, 0.1, 2), 'lemon juice': n(22, 0.4, 7, 0.3, 0.2, 1), 'worcestershire sauce': n(78, 0, 19, 0, 0, 980, 10), 'coconut milk': n(197, 2, 3, 0, 21, 13), 'peanut butter': n(588, 25, 20, 6, 50, 426, 3),
  almond: n(579, 21, 22, 12.5, 50, 1), walnut: n(654, 15, 14, 6.7, 65, 2), banana: n(89, 1.1, 23, 2.6, 0.3, 1), apple: n(52, 0.3, 14, 2.4, 0.2, 1),
  'cream of mushroom soup': n(100, 2, 8, 1, 7, 700), cornstarch: n(381, 0.3, 91, 0.9, 0.1, 9), 'baking powder': n(53, 0, 28, 0.2, 0, 10600), cocoa: n(228, 20, 58, 33, 14, 21), 'cilantro': n(23, 2.1, 3.7, 2.8, 0.5, 46), scallion: n(32, 1.8, 7, 2.6, 0.2, 16),
}

/** Grams per one piece of a count unit, by canonical ingredient name. */
export const PIECE_GRAMS: Record<string, number> = {
  egg: 50, 'yellow onion': 150, onion: 150, garlic: 3, 'garlic clove': 3, carrot: 61, celery: 40, potato: 170, 'sweet potato': 130, 'bell pepper': 120, tomato: 123, lemon: 58, lime: 67,
  'flour tortilla': 45, tortilla: 45, bread: 30, 'bay leaf': 0.2, 'corn on the cob': 90, pepperoncini: 10, banana: 118, apple: 182, 'diced tomato': 411, 'crushed tomato': 794, 'tomato sauce': 227,
  'black bean': 255, 'kidney bean': 255, 'great northern bean': 255, chickpea: 240, 'green chile': 113, 'coconut milk': 400, 'cream of mushroom soup': 298, 'ranch seasoning': 28, 'au jus mix': 28, broccoli: 300,
}

/** Grams per can/jar/bottle/stick/packet/slice/head/bunch when the item name does not settle it. */
export const CONTAINER_GRAMS: Record<string, number> = { can: 411, jar: 450, bottle: 500, stick: 113, packet: 28, slice: 30, head: 500, bunch: 100, carton: 946, bag: 450, box: 400, pack: 300, loaf: 500, dozen: 600 }

/** Grams per ml for volume measures; 1 when unknown. */
export const DENSITY: Record<string, number> = {
  'all-purpose flour': 0.53, flour: 0.53, sugar: 0.85, 'brown sugar': 0.9, 'white rice': 0.78, rice: 0.78, oat: 0.4, 'olive oil': 0.92, 'vegetable oil': 0.92, butter: 0.95, honey: 1.42,
  'shredded cheddar': 0.45, cheddar: 0.45, 'sharp cheddar': 0.45, mozzarella: 0.45, parmesan: 0.4, cornstarch: 0.54, cocoa: 0.5, 'chili powder': 0.5, 'ground cumin': 0.45, cumin: 0.45, paprika: 0.5, 'dried oregano': 0.2, 'dried basil': 0.2, 'dried thyme': 0.3, 'garlic powder': 0.6, salt: 1.2, 'black pepper': 0.5, 'cajun seasoning': 0.6,
  'frozen corn': 0.68, 'frozen pea': 0.65, 'frozen broccoli': 0.4, 'frozen hash brown': 0.5, 'frozen spinach': 0.65, 'cooked chicken': 0.6, 'cooked rice': 0.8, 'tortilla chip': 0.25, 'dried red bean': 0.8, cilantro: 0.1, scallion: 0.4,
}
