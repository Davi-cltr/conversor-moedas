import s from './AboutData.module.css'

export function AboutData() {
  return (
    <section className={`secao ${s.secao}`} id="sobre" aria-labelledby="sobre-titulo">
      <h2 id="sobre-titulo" className="titulo-secao">
        Sobre os números
      </h2>
      <div className={s.colunas}>
        <article>
          <h3>Na conversão: cotação comercial</h3>
          <p className="prosa">
            Vem da <a href="https://docs.awesomeapi.com.br/api-de-moedas">AwesomeAPI</a>, que reúne cotações de compra e venda do
            mercado e as atualiza ao longo do dia. A conversão usa o ponto médio entre as duas. Consultas sem chave de acesso podem
            chegar com até um minuto de atraso, e o Lastro busca de novo a cada minuto enquanto a página está aberta. Pares sem o real,
            como euro para dólar, são calculados através do real.
          </p>
        </article>
        <article>
          <h3>No histórico: PTAX do Banco Central</h3>
          <p className="prosa">
            A <a href="https://dadosabertos.bcb.gov.br/dataset/taxas-de-cambio-todos-os-boletins-diarios">PTAX</a> é a taxa de
            referência oficial, publicada uma vez por dia útil e usada como base em contratos e balanços. O gráfico mostra a PTAX de venda do boletim de fechamento. Fins de semana e feriados não têm PTAX;
            esses dias não são preenchidos. O Banco Central publica PTAX para dez moedas. Para as outras, o histórico vem do fechamento
            diário da AwesomeAPI, e a página avisa quando isso acontece.
          </p>
        </article>
        <article>
          <h3>O que estes números não são</h3>
          <p className="prosa">
            Nenhum valor aqui é o preço de uma operação. Bancos, cartões e casas de câmbio cobram spread, tarifas e IOF, e o preço
            muda com o horário e o prestador. O histórico mostra o que aconteceu; o Lastro não faz previsões nem indica se é um bom
            momento para comprar ou vender.
          </p>
        </article>
      </div>
    </section>
  )
}
