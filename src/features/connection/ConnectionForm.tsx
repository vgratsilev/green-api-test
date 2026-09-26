import { useState, type SubmitEvent } from 'react'
import { AsYouType, getCountryCallingCode, getExampleNumber, validatePhoneNumberLength, type CountryCode } from 'libphonenumber-js'
import mobileExamples from 'libphonenumber-js/mobile/examples'

import type { GreenApiCredentials } from '../../domain/chat'
import { CountryCombobox } from './CountryCombobox'

type ConnectionFormProps = {
  onConnect: (credentials: GreenApiCredentials, phone: string) => void
}

function formatPhone(value: string, country?: CountryCode) {
  const digits = value.replace(/\D/g, '')
  const valueWithCountryCode = value.startsWith('+') ? `+${digits}` : digits

  return new AsYouType(country).input(valueWithCountryCode)
}

function getCountryPhonePrefix(country: CountryCode) {
  return `+${getCountryCallingCode(country)}`
}

function getNormalizedPhone(value: string, country?: CountryCode) {
  if (!country) {
    return ''
  }

  const formatter = new AsYouType(country)
  formatter.input(value)

  return formatter.getNumberValue()?.replace(/\D/g, '') ?? ''
}

function detectCountry(value: string) {
  const formatter = new AsYouType()
  formatter.input(value)

  return formatter.getCountry()
}

export function ConnectionForm({ onConnect }: ConnectionFormProps) {
  const [instanceId, setInstanceId] = useState('')
  const [apiToken, setApiToken] = useState('')
  const [country, setCountry] = useState<CountryCode>()
  const [phone, setPhone] = useState('')
  const [error, setError] = useState('')

  function updatePhone(value: string) {
    if (!country) {
      const formattedPhone = formatPhone(value)
      const detectedCountry = detectCountry(formattedPhone)

      setPhone(formattedPhone)
      if (detectedCountry) {
        setCountry(detectedCountry)
        if (/^\d{7,15}$/.test(getNormalizedPhone(formattedPhone, detectedCountry))) {
          setError('')
        }
      }
      return
    }

    const countryPrefix = getCountryPhonePrefix(country)
    const countryCode = countryPrefix.slice(1)
    const digits = value.replace(/\D/g, '')
    const nationalDigits = digits.startsWith(countryCode) ? digits.slice(countryCode.length) : digits
    const valueWithProtectedPrefix = value.startsWith(countryPrefix)
      ? value
      : `${countryPrefix}${nationalDigits}`
    const maxNationalDigits = getExampleNumber(country, mobileExamples)?.nationalNumber.length

    if (maxNationalDigits && nationalDigits.length > maxNationalDigits) {
      return
    }

    const formattedPhone = formatPhone(valueWithProtectedPrefix, country)

    if (validatePhoneNumberLength(formattedPhone) === 'TOO_LONG') {
      return
    }

    setPhone(formattedPhone)
    if (/^\d{7,15}$/.test(getNormalizedPhone(formattedPhone, country))) {
      setError('')
    }
  }

  function updateCountry(nextCountry: CountryCode) {
    setCountry(nextCountry)
    setPhone(getCountryPhonePrefix(nextCountry))
  }

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalizedPhone = getNormalizedPhone(phone, country)

    if (!country || !/^\d{7,15}$/.test(normalizedPhone)) {
      setError('Введите номер в международном формате.')
      return
    }

    setError('')
    onConnect({ instanceId, apiToken }, normalizedPhone)
  }

  return (
    <form className="connection-form" onSubmit={submit}>
      <label htmlFor="instance-id">ID инстанса</label>
      <input id="instance-id" name="instanceId" value={instanceId} onChange={(event) => setInstanceId(event.target.value)} autoComplete="off" inputMode="numeric" required />

      <label htmlFor="api-token">API token инстанса</label>
      <input id="api-token" name="apiToken" type="password" value={apiToken} onChange={(event) => setApiToken(event.target.value)} autoComplete="off" required />

      <label htmlFor="recipient-phone">Номер получателя</label>
      <div className="phone-input-group">
        <CountryCombobox country={country} onChange={updateCountry} />
        <input id="recipient-phone" name="phone" value={phone} onChange={(event) => updatePhone(event.target.value)} autoComplete="tel" inputMode="tel" aria-describedby={error ? 'phone-error' : undefined} required />
      </div>
      {error && <p id="phone-error" className="notice" role="alert">{error}</p>}

      <p className="hint">Данные остаются только в памяти вкладки. Используйте отдельный авторизованный инстанс с пустым webhookUrl и включёнными входящими уведомлениями.</p>
      <button type="submit">Открыть чат</button>
    </form>
  )
}
