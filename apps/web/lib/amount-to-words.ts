type Lang = "az" | "ru";

function capFirst(s: string): string {
  if (!s) return s;
  return s[0]!.toUpperCase() + s.slice(1);
}

function parseAmountToParts(amount: number | string): { intPart: number; fracPart: number } {
  const n = typeof amount === "number" ? amount : Number(String(amount).replace(",", "."));
  if (!Number.isFinite(n)) return { intPart: 0, fracPart: 0 };
  const fixed = Math.round(n * 100);
  const intPart = Math.floor(fixed / 100);
  const fracPart = fixed % 100;
  return { intPart, fracPart };
}

function triads(num: number): number[] {
  const out: number[] = [];
  let n = Math.floor(Math.abs(num));
  if (n === 0) return [0];
  while (n > 0) {
    out.push(n % 1000);
    n = Math.floor(n / 1000);
  }
  return out;
}

function ruPlural(n: number, one: string, few: string, many: string): string {
  const x = Math.abs(n) % 100;
  const y = x % 10;
  if (x >= 11 && x <= 19) return many;
  if (y === 1) return one;
  if (y >= 2 && y <= 4) return few;
  return many;
}

function ruTriadToWords(n: number, feminine: boolean): string {
  const onesM = ["", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"];
  const onesF = ["", "одна", "две", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"];
  const teens = ["десять", "одиннадцать", "двенадцать", "тринадцать", "четырнадцать", "пятнадцать", "шестнадцать", "семнадцать", "восемнадцать", "девятнадцать"];
  const tens = ["", "", "двадцать", "тридцать", "сорок", "пятьдесят", "шестьдесят", "семьдесят", "восемьдесят", "девяносто"];
  const hundreds = ["", "сто", "двести", "триста", "четыреста", "пятьсот", "шестьсот", "семьсот", "восемьсот", "девятьсот"];

  const h = Math.floor(n / 100);
  const t = Math.floor((n % 100) / 10);
  const o = n % 10;
  const parts: string[] = [];
  if (h) parts.push(hundreds[h]!);
  if (t === 1) {
    parts.push(teens[o]!);
  } else {
    if (t) parts.push(tens[t]!);
    if (o) parts.push((feminine ? onesF : onesM)[o]!);
  }
  return parts.join(" ");
}

function ruIntToWords(n: number): string {
  if (n === 0) return "ноль";
  const units = triads(n);
  const scale = [
    { one: "", few: "", many: "", fem: false },
    { one: "тысяча", few: "тысячи", many: "тысяч", fem: true },
    { one: "миллион", few: "миллиона", many: "миллионов", fem: false },
    { one: "миллиард", few: "миллиарда", many: "миллиардов", fem: false },
  ];
  const parts: string[] = [];
  for (let i = units.length - 1; i >= 0; i--) {
    const tri = units[i]!;
    if (tri === 0) continue;
    const sc = scale[i] ?? scale[scale.length - 1]!;
    parts.push(ruTriadToWords(tri, sc.fem));
    if (i > 0) parts.push(ruPlural(tri, sc.one, sc.few, sc.many));
  }
  return parts.join(" ").trim();
}

function azTriadToWords(n: number): string {
  const ones = ["", "bir", "iki", "üç", "dörd", "beş", "altı", "yeddi", "səkkiz", "doqquz"];
  const tens = ["", "on", "iyirmi", "otuz", "qırx", "əlli", "altmış", "yetmiş", "səksən", "doxsan"];
  const h = Math.floor(n / 100);
  const t = Math.floor((n % 100) / 10);
  const o = n % 10;
  const parts: string[] = [];
  if (h) parts.push(h === 1 ? "yüz" : `${ones[h]} yüz`);
  if (t) parts.push(tens[t]!);
  if (o) parts.push(ones[o]!);
  return parts.join(" ");
}

function azIntToWords(n: number): string {
  if (n === 0) return "sıfır";
  const units = triads(n);
  const scale = ["", "min", "milyon", "milyard"];
  const parts: string[] = [];
  for (let i = units.length - 1; i >= 0; i--) {
    const tri = units[i]!;
    if (tri === 0) continue;
    const triWords = azTriadToWords(tri);
    if (i === 1 && tri === 1) {
      parts.push("min");
      continue;
    }
    parts.push(triWords);
    const sc = scale[i];
    if (sc) parts.push(sc);
  }
  return parts.join(" ").trim();
}

export function amountToWords(amount: number | string, lang: Lang): string {
  const { intPart, fracPart } = parseAmountToParts(amount);
  if (lang === "az") {
    const intW = azIntToWords(intPart);
    const fracW = azIntToWords(fracPart);
    return capFirst(`${intW} manat ${fracW} qəpik`);
  }
  const intW = ruIntToWords(intPart);
  const fracW = ruIntToWords(fracPart);
  const manat = ruPlural(intPart, "манат", "маната", "манатов");
  const kopek = ruPlural(fracPart, "копейка", "копейки", "копеек");
  return capFirst(`${intW} ${manat} ${fracW} ${kopek}`);
}

