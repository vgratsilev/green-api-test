import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { getCountries, getCountryCallingCode, type CountryCode } from 'libphonenumber-js'

type CountryComboboxProps = {
  country?: CountryCode
  onChange: (country: CountryCode) => void
}

const countryNames = new Intl.DisplayNames(['ru'], { type: 'region' })

function getFlagUrl(country: CountryCode) {
  return `https://flagcdn.com/w40/${country.toLowerCase()}.png`
}

export function CountryCombobox({ country, onChange }: CountryComboboxProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const comboboxRef = useRef<HTMLDivElement>(null)
  const selectedCountryOptionRef = useRef<HTMLButtonElement>(null)
  const countries = useMemo(() => getCountries().sort((left, right) => (
    countryNames.of(left)?.localeCompare(countryNames.of(right) ?? '', 'ru') ?? 0
  )), [])

  useEffect(() => {
    if (!isMenuOpen) {
      return
    }

    selectedCountryOptionRef.current?.focus()

    function closeMenuOnOutsidePointerDown(event: PointerEvent) {
      if (!comboboxRef.current?.contains(event.target as Node)) {
        setIsMenuOpen(false)
      }
    }

    document.addEventListener('pointerdown', closeMenuOnOutsidePointerDown)

    return () => document.removeEventListener('pointerdown', closeMenuOnOutsidePointerDown)
  }, [isMenuOpen])

  function selectCountry(nextCountry: CountryCode) {
    onChange(nextCountry)
    setIsMenuOpen(false)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'Escape') {
      setIsMenuOpen(false)
    }
  }

  return (
    <div className="country-combobox" ref={comboboxRef}>
      <button
        aria-controls="country-options"
        aria-expanded={isMenuOpen}
        aria-haspopup="listbox"
        aria-label="Страна"
        className="country-trigger"
        onClick={() => setIsMenuOpen((isOpen) => !isOpen)}
        onKeyDown={handleKeyDown}
        role="combobox"
        type="button"
      >
        {country ? (
          <img alt="" className="country-flag" src={getFlagUrl(country)} />
        ) : (
          <span aria-hidden="true" className="country-placeholder">🌐</span>
        )}
        <span
          aria-hidden="true"
          className={`country-chevron${isMenuOpen ? ' country-chevron-open' : ''}`}
        />
      </button>
      {isMenuOpen && (
        <ul aria-label="Страны" className="country-options" id="country-options" role="listbox">
          {countries.map((countryCode) => (
            <li key={countryCode}>
              <button
                aria-selected={country === countryCode}
                className="country-option"
                onClick={() => selectCountry(countryCode)}
                ref={country === countryCode ? selectedCountryOptionRef : undefined}
                role="option"
                type="button"
              >
                <img alt="" className="country-option-flag" src={getFlagUrl(countryCode)} />
                <span>{countryNames.of(countryCode)}</span>
                <span className="country-code">+{getCountryCallingCode(countryCode)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
