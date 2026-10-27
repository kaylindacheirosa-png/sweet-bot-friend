// Recompensa diária (/daily) — moeda "Gems".
// Para mudar textos, chances ou valores, edite apenas este arquivo.

export interface DailyTier {
  min: number;
  max: number;
  weight: number;
}

/** Chances de cada faixa de recompensa (pesos relativos, como a dona definiu). */
export const DAILY_TIERS: DailyTier[] = [
  { min: 0, max: 150, weight: 55 },
  { min: 150, max: 500, weight: 35 },
  { min: 500, max: 800, weight: 10 },
  { min: 800, max: 900, weight: 5 },
  { min: 1000, max: 1000, weight: 2 },
];

/** Presente da primeira recompensa de cada usuário. */
export const DAILY_FIRST_BONUS = 200;

/** Sorteia o valor do daily respeitando as chances de cada faixa. */
export function rollDailyAmount(random: () => number = Math.random): number {
  const total = DAILY_TIERS.reduce((sum, t) => sum + t.weight, 0);
  let pick = random() * total;
  let tier = DAILY_TIERS[DAILY_TIERS.length - 1]!;
  for (const t of DAILY_TIERS) {
    if (pick < t.weight) {
      tier = t;
      break;
    }
    pick -= t.weight;
  }
  return tier.min + Math.floor(random() * (tier.max - tier.min + 1));
}

const e = (id: string, fallback: string) =>
  `<tg-emoji emoji-id="${id}">${fallback}</tg-emoji>`;

/** Mensagem enviada apenas na primeira recompensa do usuário. */
export const DAILY_FIRST_MESSAGE = `${e("5201914481671682382", "🎀")} • Parabéns por se registrar e conquistar seus próprios gems! Como recompensa lhe daremos 200 Gems de presente. Volte amanhã para conquistar mais gems.`;

/** Mensagens sorteadas nos dailies seguintes; {amount} vira o valor sorteado. */
export const DAILY_MESSAGES: string[] = [
  `${e("5260700429196477812", "👼")}・Um anjinho deixou {amount} Gems na sua conta! Volte amanhã para descobrir sua próxima surpresa.`,
  `${e("6041708904482609611", "🌸")}・As flores desabrocharam e trouxeram um presente: {amount} Gems para você! ♡`,
  `${e("6041904853775554687", "✨")}・Seu momento de brilhar chegou! Você ganhou {amount} Gems no daily de hoje. Use-as com sabedoria...`,
  `${e("6044066429211252272", "💌")}・Uma cartinha de amor chegou! Dentro dela existem {amount} Gems esperando por você. Até amanhã, docinho! 💌`,
  `${e("6041827905141480714", "👑")}・Mais um dia, mais uma conquista! Você acaba de receber {amount} Gems. Continue juntando para desbloquear recompensas incríveis! 👑`,
  `${e("5454096535883105729", "🎁")}・ Hoje você merece uma recompensa. Aqui estão {amount} Gems para você!`,
  `${e("5323345125663851213", "💝")} • Seu crush mandou um presentinho secreto... brincadeira! Aqui estão seus {amount} Gems de hoje.`,
  `${e("5190768573387131576", "🌟")}・O universo sorriu para você hoje! Você ganhou {amount} Gems. Que a sorte continue te acompanhando!`,
  `${e("5276151690007955604", "💗")}・Uma dose de amor chegou para você! Seu presente diário é de {amount} Love Gems. Volte amanhã para ganhar mais! ♡`,
  `${e("5294082813396554610", "🍬")}・Parabéns, docinho! ♡ Hoje você recebeu mais {amount} Love Gems! Guarde suas gemas ou gaste na lojinha do amor.`,
];

/** Escolhe uma mensagem aleatória e coloca o valor sorteado nela. */
export function buildDailyMessage(amount: number, random: () => number = Math.random): string {
  const template = DAILY_MESSAGES[Math.floor(random() * DAILY_MESSAGES.length)]!;
  return template.replaceAll("{amount}", String(amount));
}
