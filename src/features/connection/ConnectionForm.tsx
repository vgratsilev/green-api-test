import { useState, type SubmitEvent } from 'react'
import { AsYouType, getCountryCallingCode, getExampleNumber, validatePhoneNumberLength, type CountryCode } from 'libphonenumber-js'
import mobileExamples from 'libphonenumber-js/mobile/examples'

import { defaultApiUrl, normalizeApiUrl } from '../../config/runtime'
import type { GreenApiCredentials } from '../../domain/chat'
import { CountryCombobox } from './CountryCombobox'

export type ConnectionValues = {
  apiUrl: string
  credentials: GreenApiCredentials
  phone: string
}

type ConnectionFormProps = {
  defaultApiUrl?: string
  initialConnection?: ConnectionValues
  onConnect: (connection: ConnectionValues) => boolean | Promise<boolean>
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

export function ConnectionForm({ defaultApiUrl: initialApiUrl = defaultApiUrl, initialConnection, onConnect }: ConnectionFormProps) {
  const [apiUrl, setApiUrl] = useState(initialConnection?.apiUrl ?? initialApiUrl)
  const [instanceId, setInstanceId] = useState(initialConnection?.credentials.instanceId ?? '')
  const [apiToken, setApiToken] = useState(initialConnection?.credentials.apiToken ?? '')
  const initialPhone = initialConnection ? `+${initialConnection.phone}` : ''
  const [country, setCountry] = useState<CountryCode | undefined>(() => detectCountry(initialPhone))
  const [phone, setPhone] = useState(() => formatPhone(initialPhone))
  const [error, setError] = useState('')
  const [isPending, setIsPending] = useState(false)

  function updatePhone(value: string) {
    if (!country) {
      const digits = value.replace(/\D/g, '')
      const internationalValue = value.startsWith('+') || !/^\d{7,15}$/.test(digits)
        ? value
        : `+${digits}`
      const formattedPhone = formatPhone(internationalValue)
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

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalizedApiUrl = normalizeApiUrl(apiUrl)
    const normalizedPhone = getNormalizedPhone(phone, country)

    if (!normalizedApiUrl) {
      setError('Введите публичный HTTPS origin GREEN-API без пути, query и credentials.')
      return
    }

    if (!country || !/^\d{7,15}$/.test(normalizedPhone)) {
      setError('Введите номер в международном формате.')
      return
    }

    setError('')
    setIsPending(true)
    try {
      const connected = await onConnect({
        apiUrl: normalizedApiUrl,
        credentials: { instanceId, apiToken },
        phone: normalizedPhone,
      })
      if (!connected) setError('Не удалось подтвердить подключение. Проверьте данные инстанса и повторите попытку.')
    } catch {
      setError('Не удалось подтвердить подключение. Проверьте данные инстанса и повторите попытку.')
    } finally {
      setIsPending(false)
    }
  }

  return (
    <form className="connection-form" onSubmit={submit}>
      <label htmlFor="api-origin">API origin GREEN-API</label>
      <input id="api-origin" name="apiUrl" type="url" value={apiUrl} onChange={(event) => setApiUrl(event.target.value)} autoComplete="url" inputMode="url" aria-describedby={error ? 'connection-error' : undefined} required />

      <label htmlFor="instance-id">ID инстанса</label>
      <input id="instance-id" name="instanceId" value={instanceId} onChange={(event) => setInstanceId(event.target.value)} autoComplete="off" inputMode="numeric" aria-describedby={error ? 'connection-error' : undefined} required />

      <label htmlFor="api-token">API token инстанса</label>
      <input id="api-token" name="apiToken" type="password" value={apiToken} onChange={(event) => setApiToken(event.target.value)} autoComplete="off" aria-describedby={error ? 'connection-error' : undefined} required />

      <label htmlFor="recipient-phone">Номер получателя</label>
      <div className="phone-input-group">
        <CountryCombobox country={country} onChange={updateCountry} />
        <input id="recipient-phone" name="phone" value={phone} onChange={(event) => updatePhone(event.target.value)} autoComplete="tel" inputMode="tel" aria-describedby={error ? 'connection-error' : undefined} required />
      </div>
      {error && <p id="connection-error" className="notice" role="alert">{error}</p>}

      <p className="hint">Данные остаются только в памяти вкладки. Используйте отдельный авторизованный инстанс с пустым webhookUrl и включёнными входящими уведомлениями.</p>
      <button type="submit" disabled={isPending}>{isPending ? 'Проверяем подключение…' : 'Открыть чат'}</button>
    </form>
  )
}
