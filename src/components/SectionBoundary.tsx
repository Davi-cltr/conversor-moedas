import { Component, type ReactNode } from 'react'

interface Props {
  name: string
  children: ReactNode
}

/** Isola falhas de renderização: um erro numa seção não derruba a página. */
export class SectionBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.error(`[Lastro] Falha ao exibir ${this.props.name}:`, error)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="secao" role="alert" style={{ paddingBlock: 'var(--e-6)' }}>
        <p className="prosa">
          Não foi possível exibir {this.props.name}. O restante da página continua funcionando.{' '}
          <button type="button" className="botao-texto" onClick={() => this.setState({ failed: false })}>
            Tentar de novo
          </button>
        </p>
      </div>
    )
  }
}
