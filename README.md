# Lastro

Conversor de moedas com o histórico oficial do câmbio, feito para quem pensa em reais.

O Lastro responde três perguntas, da mais rápida à mais curiosa:

1. **Quanto dá?** Conversão imediata entre 20 moedas, com compra, venda e o horário da cotação.
2. **Como chegou aqui?** Histórico interativo da PTAX do Banco Central, com indicadores do período, comparação entre moedas e alternativa em tabela.
3. **O que mudou para o meu dinheiro?** "Seu real em outra data" mostra quanto uma quantia em reais comprava, num dia escolhido do passado, em cada uma das dez moedas com PTAX, e quanto compra hoje.

## Recursos

**Conversão**
- Valor lido no padrão brasileiro (`1.234,56`), sem depender do idioma do navegador. `10.5` colado de outro site é entendido como decimal, e a interface avisa como interpretou o valor.
- Aritmética decimal com [big.js](https://github.com/MikeMcl/big.js): nada passa por ponto flutuante, e o único arredondamento é o da exibição.
- Casas decimais de cada moeda pela ISO 4217 (o iene tem zero). Quando quatro casas não bastam para separar compra e venda, a interface mostra mais.
- Inversão do par, pares cruzados calculados pelo real (EUR → JPY), busca de moedas por código, nome, país ou apelido.
- Simulador de custos, em que a própria pessoa informa spread e IOF. O Lastro não sugere taxas.

**Histórico**
- Períodos de 7, 30, 90 e 180 dias, de 1 ano ou personalizado (PTAX desde 04/01/1999, até 10 anos por consulta).
- Indicadores do período: início, fim, máxima, mínima e variação absoluta e percentual, sempre com as datas.
- Gráfico em SVG próprio: leitura por toque, mouse ou teclado (setas, Home, End, PageUp/PageDown). Dias úteis sem cotação aparecem pontilhados, sem nenhum preenchimento inventado.
- "Última PTAX publicada" e "cotação comercial agora" lado a lado, com a explicação da diferença.
- Comparação entre até cinco moedas em variação percentual desde um mesmo dia. As escalas em reais são incompatíveis (iene × libra), por isso a comparação não usa os preços.

**Seu real em outra data** (recurso autoral)
- Quantia em reais e uma data no passado (atalhos de 1, 5, 10 e 20 anos).
- Para cada moeda: quanto o dinheiro comprava, quanto compra hoje e a variação do poder de compra, em barras divergentes.
- Deixa explícito que mostra só o efeito do câmbio, sem inflação nem custos.

**Confiabilidade**
- Cache em memória e no `localStorage`, sempre com a data de origem exibida. Dados guardados nunca aparecem como cotação atual.
- Requisições idênticas viram uma só, as obsoletas são canceladas, respostas fora de ordem são descartadas e há tempo limite por fonte.
- Uma falha de fonte não derruba a página. Cada seção explica o que falhou e oferece "Tentar de novo".
- O estado fica na URL (`?de=USD&para=BRL&valor=100&periodo=90d`), então uma consulta pode ser compartilhada.

## Fontes de dados

| Uso | Fonte | O que é |
| --- | --- | --- |
| Conversão | [AwesomeAPI](https://docs.awesomeapi.com.br/api-de-moedas) `/json/last` | Cotação **comercial** de compra e venda, atualizada ao longo do dia. A conversão usa o ponto médio. Sem chave, pode chegar com até 1 minuto de atraso; o Lastro consulta de novo a cada minuto com a aba visível. |
| Histórico (USD, EUR, GBP, JPY, CAD, AUD, CHF, DKK, NOK, SEK) | [API PTAX do Banco Central](https://dadosabertos.bcb.gov.br/dataset/taxas-de-cambio-todos-os-boletins-diarios) `CotacaoMoedaPeriodo` | Taxa de **referência oficial**: PTAX de venda do boletim de fechamento, uma por dia útil. |
| Histórico das demais moedas | AwesomeAPI `/json/daily` | Fechamento comercial diário (até 360 registros por consulta). A interface avisa quando a fonte é esta. |

A cotação comercial e a PTAX medem coisas diferentes, e o Lastro nunca mistura as duas numa mesma série. Nenhum valor exibido é o preço de uma operação: spread, tarifas, IOF e horário mudam o resultado. O Lastro não faz previsões.

## Arquitetura

React 19 + TypeScript + Vite. O CSS usa CSS Modules e tokens próprios. Não há biblioteca de gráficos nem de componentes.

```
src/
  domain/      regras puras e testadas: dinheiro, datas, moedas, períodos, séries, pares
  api/         http (timeout, cancelamento, erros classificados), normalização de cada fonte, cache e repositório
  hooks/       useResource: cache → rede, cancelamento, atualização periódica
  state/       estado compartilhável na URL
  components/  converter/, history/, timeMachine/, DateField, Masthead…
  styles/      tokens.css (sistema visual) e base.css
  test/        amostras reais das APIs e fetch simulado, usados só nos testes
```

## Identidade visual

A linguagem é a da impressão de segurança das cédulas:

- **Papel-moeda** frio no fundo, **tinta de talho-doce** no texto e **azul de gravura** para ações e seleção. As séries de comparação usam as tintas das notas do real.
- O conversor é uma **cédula**, com faixa de microlinhas e um **selo guilhoché** (hipotrocoide) gerado a partir do par de moedas. Cada par tem um desenho próprio, e inverter o par gira o selo.
- **Archivo** (eixo de largura variável) para números e dados, com algarismos tabulares. **Source Serif 4** para os textos explicativos.
- O gráfico usa hachura de gravura no lugar de gradiente. Tema escuro **"luz UV"**: a mesma cédula sob luz ultravioleta.
- Variações sempre com glifo e sinal (▲ +1,2%), nunca só cor. A animação respeita `prefers-reduced-motion`.

## Como executar

Requer Node 20.19+ ou 22.12+ (testado com Node 22).

```bash
npm install
npm run dev        # servidor de desenvolvimento
npm run build      # typecheck + build de produção em dist/
npm run preview    # serve o build
npm test           # testes (Vitest + Testing Library)
npm run typecheck
npm run lint       # oxlint
```

As duas APIs são públicas e aceitam chamadas do navegador. Não há chaves nem variáveis de ambiente. O build usa caminhos relativos e funciona no GitHub Pages ou em qualquer subpasta.

## Testes

São 88 testes, que cobrem:
- leitura de valores brasileiros, arredondamento, casas ISO 4217 e conversão;
- datas em Brasília, datas digitadas em dd/mm/aaaa, períodos e validação de intervalos;
- séries de pares sem interpolação, máxima/mínima, variações, lacunas e base 100;
- normalização das respostas reais das duas APIs, erros, cache e requisições compartilhadas;
- interface: carregamento sem resultado inventado, conversão, inversão, iene sem centavos, entrada inválida, falha de rede, troca de período, navegação do gráfico por teclado, comparação e "Seu real em outra data".

Os dados simulados ficam em `src/test/` e nunca são importados pela aplicação.
