import test from 'node:test';
import assert from 'node:assert/strict';
import { pronounce, numberWords } from '../src/audio/pronounce.js';

test('abbreviations on stop names are read out in full', () => {
  assert.equal(pronounce('Следваща спирка ж.к. Бокар.'), 'Следваща спирка жилищен комплекс Бокар.');
  assert.equal(pronounce('в.з. кв. Бояна'), 'вилна зона квартал Бояна');
  assert.equal(pronounce('бул. Акад. Иван Гешов'), 'булевард академик Иван Гешов');
  assert.equal(pronounce('пл. Ручей'), 'площад Ручей');
  assert.equal(pronounce('Метростанция „Витоша“'), 'Метростанция Витоша');
  assert.equal(pronounce('Детски дом – Киноцентър'), 'Детски дом, Киноцентър');
  assert.equal(pronounce('Фохар АД'), 'Фохар а де');
});

test('street numbers become words, words inside names are left alone', () => {
  assert.equal(pronounce('ул. 10'), 'улица десет');
  assert.equal(pronounce('ул. 5'), 'улица пет');
  assert.equal(numberWords(21), 'двадесет и едно');
  assert.equal(numberWords(280), 'двеста и осемдесет');
  assert.equal(pronounce('Скиорката'), 'Скиорката'); // "СК" only as a word
  assert.equal(pronounce('Улица Сребърна'), 'Улица Сребърна');
});
