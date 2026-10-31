import test from 'node:test';
import assert from 'node:assert/strict';
import { kindOf } from '../src/world/ShopFronts.js';

test('shop fronts: the kind of shop comes from its name', () => {
  const cases = {
    'Аптека Субра': 'pharmacy', 'Sopharma': 'pharmacy', Hesburger: 'cafe', 'Кафе Лаваца': 'cafe', 'Pizza Nino': 'cafe',
    Lidl: 'grocery', 'Фантастико': 'grocery', 'Пекарна Хлебна къща': 'bakery', 'Сладкарница Неделя': 'bakery',
    'DSK Bank': 'office', 'Vivacom': 'office', 'Салон за красота Ева': 'salon', 'Бутик Мона': 'clothes', 'Магазин': 'shop',
  };
  for (const [name, kind] of Object.entries(cases)) assert.equal(kindOf(name), kind, name);
});
