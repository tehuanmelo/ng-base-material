import { useMemo, useState, type FormEvent } from 'react'
import { baseOptions, psOptions } from './data'
import './App.css'

type Material = {
  id: string
  name: string
  description: string
  category: 'Close Combate' | 'Strike' | 'Jiu-jitsu'
}

const materialGroups: Material['category'][] = ['Close Combate', 'Strike', 'Jiu-jitsu']

const materials: Material[] = [
  {
    id: 'pistola',
    name: 'Pistola',
    description: 'Pistola de borrracha para treino de close combat',
    category: 'Close Combate',
  },
  {
    id: 'faca',
    name: 'Faca',
    description: 'Faca de borracha para treino de close combat',
    category: 'Close Combate',
  },
  {
    id: 'rifle',
    name: 'Rifle',
    description: 'Rifle de borracha para treino de close combat',
    category: 'Close Combate',
  },
  {
    id: 'bastao',
    name: 'Bastão',
    description: 'Bastao de borracha para treino de close combat',
    category: 'Close Combate',
  },
  {
    id: 'capacete',
    name: 'Capacete',
    description: 'Capacete de protecao para treino de MMA e Strike',
    category: 'Strike',
  },
  {
    id: 'aparador-soco',
    name: 'Aparador de soco',
    description: 'Aparadores disponíveis (unidade)',
    category: 'Strike',
  },
  {
    id: 'aparador-chute',
    name: 'Aparador de chute',
    description: 'Aparadores disponíveis (unidade)',
    category: 'Strike',
  },
  {
    id: 'luva',
    name: 'Luva',
    description: 'Pares de luvas para treino de MMA e Strike',
    category: 'Strike',
  },
  {
    id: 'protetor-canela',
    name: 'Protetor de canela',
    description: 'Pares de protetores disponíveis',
    category: 'Strike',
  },
  {
    id: 'protetor-bucal',
    name: 'Protetor bucal',
    description: 'Unidades em condições de uso',
    category: 'Strike',
  },
  {
    id: 'coquilha',
    name: 'Coquilha',
    description: 'Unidades em condições de uso',
    category: 'Strike',
  },
  {
    id: 'saco-pancada',
    name: 'Saco de pancada',
    description: 'Sacos disponiveis',
    category: 'Strike',
  },
  {
    id: 'dummy',
    name: 'Dummy',
    description: 'Dummy de treino disponível',
    category: 'Jiu-jitsu',
  },
]

const initialQuantities = Object.fromEntries(
  materials.map((material) => [material.id, 0]),
) as Record<string, number>

function ChevronIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="m5.5 7.5 4.5 4.5 4.5-4.5" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m5 12 4.5 4.5L19 7" />
    </svg>
  )
}

function App() {
  const [psNumber, setPsNumber] = useState('')
  const [base, setBase] = useState('')
  const [quantities, setQuantities] = useState(initialQuantities)
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [showErrors, setShowErrors] = useState(false)

  const totalItems = useMemo(
    () => Object.values(quantities).reduce((total, quantity) => total + quantity, 0),
    [quantities],
  )

  const filledMaterials = useMemo(
    () => Object.values(quantities).filter((quantity) => quantity > 0).length,
    [quantities],
  )

  const updateQuantity = (id: string, change: number) => {
    setSubmitted(false)
    setQuantities((current) => ({
      ...current,
      [id]: Math.max(0, Math.min(999, current[id] + change)),
    }))
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setShowErrors(true)

    if (!psNumber || !base || totalItems === 0) return

    setIsSubmitting(true)
    await new Promise((resolve) => window.setTimeout(resolve, 850))
    setIsSubmitting(false)
    setSubmitted(true)
    setShowErrors(false)
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
  }

  return (
    <div className="app-shell">
      <div className="top-line" />

      <header className="site-header">
        <div className="header-inner">
          <img
            src="/logo_national_guard.png"
            className="brand-logo"
            alt="National Guard"
          />
          <div className="brand-copy">
            <p className="eyebrow">National Guard</p>
            <h1>Inventário de materiais</h1>
            <p>Controlo de equipamentos disponíveis na base</p>
          </div>
          <div className="status-pill">
            <span /> Formulário ativo
          </div>
        </div>
      </header>

      <main className="page-content">
        <div className="intro-row">
          <div>
            <p className="section-kicker">Inventário da base</p>
            <h2>Informe o material disponível</h2>
            <p className="intro-text">
              Selecione a sua identificação e atualize as quantidades abaixo.
            </p>
          </div>
          <div className="step-indicator" aria-label="Passo 1 de 1">
            <span>1</span>
            <div>
              <strong>Registro único</strong>
              <small>Leva cerca de 2 minutos</small>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <section className="card identity-card" aria-labelledby="identificacao-title">
            <div className="card-heading">
              <span className="heading-number">01</span>
              <div>
                <h3 id="identificacao-title">Identificação</h3>
                <p>Escolha os seus dados antes de preencher o inventário.</p>
              </div>
            </div>

            <div className="field-grid">
              <label className="field">
                <span>Número PS e nome <em>*</em></span>
                <div className={`select-wrap ${showErrors && !psNumber ? 'has-error' : ''}`}>
                  <select
                    value={psNumber}
                    onChange={(event) => {
                      setPsNumber(event.target.value)
                      setSubmitted(false)
                    }}
                    aria-invalid={showErrors && !psNumber}
                  >
                    <option value="">Selecione o seu PS</option>
                    {psOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <ChevronIcon />
                </div>
                {showErrors && !psNumber && (
                  <small className="error-text">Selecione o seu número PS.</small>
                )}
              </label>

              <label className="field">
                <span>Localização da base <em>*</em></span>
                <div className={`select-wrap ${showErrors && !base ? 'has-error' : ''}`}>
                  <select
                    value={base}
                    onChange={(event) => {
                      setBase(event.target.value)
                      setSubmitted(false)
                    }}
                    aria-invalid={showErrors && !base}
                  >
                    <option value="">Selecione a sua base</option>
                    {baseOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  <ChevronIcon />
                </div>
                {showErrors && !base && (
                  <small className="error-text">Selecione uma localização.</small>
                )}
              </label>
            </div>
          </section>

          <section className="inventory-section" aria-labelledby="material-title">
            <div className="section-title-row">
              <div className="card-heading inventory-heading">
                <span className="heading-number">02</span>
                <div>
                  <h3 id="material-title">Material disponível</h3>
                  <p>Registe todo o material disponivel ou armazenado no almoxarifado.</p>
                </div>
              </div>
              <div className="inventory-summary" aria-live="polite">
                <strong>{totalItems}</strong>
                <span>unidades no total</span>
              </div>
            </div>

            <div className="materials-card">
              {materialGroups.map((group) => {
                const groupMaterials = materials.filter(
                  (material) => material.category === group,
                )

                return (
                  <div className="material-group" key={group}>
                    <div className="group-heading">
                      <div>
                        <span>Grupo</span>
                        <h4>{group}</h4>
                      </div>
                      <small>{groupMaterials.length} {groupMaterials.length === 1 ? 'material' : 'materiais'}</small>
                    </div>
                    {groupMaterials.map((material) => (
                      <div className="material-row" key={material.id}>
                        <div className="material-index" aria-hidden="true">
                          {String(materials.indexOf(material) + 1).padStart(2, '0')}
                        </div>
                        <div className="material-copy">
                          <div className="material-title-line">
                            <h4>{material.name}</h4>
                          </div>
                          <p>{material.description}</p>
                        </div>
                        <div className="stepper" aria-label={`Quantidade de ${material.name}`}>
                          <button
                            type="button"
                            onClick={() => updateQuantity(material.id, -1)}
                            disabled={quantities[material.id] === 0}
                            aria-label={`Diminuir ${material.name}`}
                          >
                            −
                          </button>
                          <output aria-live="polite">{quantities[material.id]}</output>
                          <button
                            type="button"
                            onClick={() => updateQuantity(material.id, 1)}
                            aria-label={`Aumentar ${material.name}`}
                          >
                            +
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
            {showErrors && totalItems === 0 && (
              <p className="inventory-error" role="alert">
                Adicione pelo menos uma unidade antes de enviar.
              </p>
            )}
          </section>

          <section className="card notes-card" aria-labelledby="observacoes-title">
            <div className="card-heading compact-heading">
              <span className="heading-number">03</span>
              <div>
                <h3 id="observacoes-title">Observações</h3>
                <p>Opcional</p>
              </div>
            </div>
            <label className="field">
              <span className="sr-only">Observações adicionais</span>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                maxLength={300}
                placeholder="Ex.: 2 pares de luvas precisam de substituição..."
              />
              <small className="character-count">{notes.length}/300</small>
            </label>
          </section>

          {submitted && (
            <div className="success-message" role="status">
              <span className="success-icon"><CheckIcon /></span>
              <div>
                <strong>Inventário registrado com sucesso</strong>
                <p>Os dados de demonstração foram preparados para envio ao Google Sheets.</p>
              </div>
            </div>
          )}

          <footer className="form-footer">
            <div className="footer-summary">
              <span>{filledMaterials} de {materials.length} materiais preenchidos</span>
              <div className="progress-track" aria-hidden="true">
                <span style={{ width: `${(filledMaterials / materials.length) * 100}%` }} />
              </div>
            </div>
            <button className="submit-button" type="submit" disabled={isSubmitting}>
              {isSubmitting ? <span className="spinner" /> : <CheckIcon />}
              {isSubmitting ? 'A registar...' : 'Registrar inventário'}
            </button>
          </footer>
        </form>
      </main>
    </div>
  )
}

export default App
