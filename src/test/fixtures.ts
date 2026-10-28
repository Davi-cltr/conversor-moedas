/**
 * Amostras de respostas usadas SOMENTE nos testes automatizados.
 * Foram copiadas de respostas reais das APIs (28/10/2026) e reduzidas.
 * A aplicação nunca importa este arquivo.
 */

export const awesomeLatestSample = {
  USDBRL: {
    code: 'USD',
    codein: 'BRL',
    name: 'Dólar Americano/Real Brasileiro',
    high: '5.3982',
    low: '5.3117',
    varBid: '0.0019',
    pctChange: '0.035507',
    bid: '5.3533',
    ask: '5.3542',
    timestamp: '1793214216',
    create_date: '2026-10-28 16:03:36',
  },
  EURBRL: {
    code: 'EUR',
    codein: 'BRL',
    name: 'Euro/Real Brasileiro',
    high: '6.0082',
    low: '5.916',
    varBid: '0.0214',
    pctChange: '0.359422',
    bid: '5.9754',
    ask: '5.9774',
    timestamp: '1793214104',
    create_date: '2026-10-28 16:01:44',
  },
  JPYBRL: {
    code: 'JPY',
    codein: 'BRL',
    name: 'Iene Japonês/Real Brasileiro',
    high: '0.0341089',
    low: '0.03358098',
    varBid: '0.00003',
    pctChange: '0.088673',
    bid: '0.03389506',
    ask: '0.03397624',
    timestamp: '1793214219',
    create_date: '2026-10-28 16:03:39',
  },
}

/** /json/daily/USD-BRL/4 — repare que 27/10 não aparece na resposta real. */
export const awesomeDailySample = [
  {
    code: 'USD',
    codein: 'BRL',
    name: 'Dólar Americano/Real Brasileiro',
    high: '5.604',
    low: '4.9648',
    varBid: '0.4064',
    pctChange: '8.18563',
    bid: '5.3712',
    ask: '5.3716',
    timestamp: '1793053805',
    create_date: '2026-10-26 19:30:05',
  },
  { high: '5.0543', low: '4.9636', varBid: '-0.0875', pctChange: '-1.73188', bid: '4.9648', ask: '4.966', timestamp: '1792790992' },
  { high: '5.0533', low: '5.021', varBid: '0.0287', pctChange: '0.571301', bid: '5.0523', ask: '5.0527', timestamp: '1792708204' },
  { high: '5.0425', low: '5.0125', varBid: '-0.0002', pctChange: '-0.003979', bid: '5.0236', ask: '5.0239', timestamp: '1792621806' },
]

export const ptaxSample = {
  '@odata.context': 'https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata$metadata',
  value: [
    { cotacaoCompra: 5.031, cotacaoVenda: 5.0316, dataHoraCotacao: '2026-10-22 10:04:12.1', tipoBoletim: 'Abertura' },
    { cotacaoCompra: 5.0377, cotacaoVenda: 5.0383, dataHoraCotacao: '2026-10-22 13:12:09.300403', tipoBoletim: 'Fechamento' },
    { cotacaoCompra: 5.04, cotacaoVenda: 5.0406, dataHoraCotacao: '2026-10-23 11:05:00.1', tipoBoletim: 'Intermediário' },
    { cotacaoCompra: 5.0371, cotacaoVenda: 5.0377, dataHoraCotacao: '2026-10-23 13:07:14.754567', tipoBoletim: 'Fechamento' },
  ],
}

/** Gera uma série PTAX sintética de dias úteis, para testes de interface. */
export function syntheticPtax(start: string, days: number, startValue: number) {
  const value: Array<{ cotacaoCompra: number; cotacaoVenda: number; dataHoraCotacao: string; tipoBoletim: string }> = []
  let v = startValue
  const d = new Date(`${start}T00:00:00Z`)
  for (let i = 0; i < days; i++) {
    const wd = d.getUTCDay()
    if (wd !== 0 && wd !== 6) {
      v = Math.round((v * (1 + Math.sin(i / 7) * 0.004)) * 10000) / 10000
      const iso = d.toISOString().slice(0, 10)
      value.push({ cotacaoCompra: v - 0.0006, cotacaoVenda: v, dataHoraCotacao: `${iso} 13:05:00.0`, tipoBoletim: 'Fechamento' })
    }
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return { value }
}
