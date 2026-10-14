'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const DEVICE_TYPES = [
  { value: 'PC', label: 'PC' },
  { value: 'MOBILE', label: 'Celular' },
  { value: 'TABLET', label: 'Tablet' },
  { value: 'OTHER', label: 'Otro' },
];

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function EyeIcon({ visible }) {
  if (visible) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Z" />
        <circle cx="12" cy="12" r="2.6" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 3l18 18" />
      <path d="M10.7 10.7a2 2 0 0 0 2.6 2.6" />
      <path d="M9.5 5.2A9.7 9.7 0 0 1 12 5c5.4 0 9 7 9 7a17 17 0 0 1-2.2 3.2" />
      <path d="M6.1 6.1C4.1 7.6 3 9.6 3 12c0 0 3.6 7 9 7a8.6 8.6 0 0 0 3.6-.8" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h13" />
      <path d="m14 7 5 5-5 5" />
    </svg>
  );
}

function HeadsetIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 14v-2a8 8 0 0 1 16 0v2" />
      <rect x="3" y="13" width="4" height="6" rx="2" />
      <rect x="17" y="13" width="4" height="6" rx="2" />
      <path d="M17 20c-1 1-2.4 1.5-4 1.5h-1" />
    </svg>
  );
}

function DeviceIcon({ type }) {
  if (type === 'MOBILE') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="7" y="2.5" width="10" height="19" rx="2" />
        <path d="M10 18.5h4" />
      </svg>
    );
  }

  if (type === 'TABLET') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4" y="2.5" width="16" height="19" rx="2" />
        <circle cx="12" cy="18.5" r=".7" />
      </svg>
    );
  }

  if (type === 'OTHER') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="8" />
        <path d="M9.5 9a2.5 2.5 0 0 1 4.8 1c0 2-2.3 2.1-2.3 4" />
        <circle cx="12" cy="17" r=".7" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [showDeviceModal, setShowDeviceModal] = useState(false);
  const [deviceType, setDeviceType] = useState('PC');
  const [deviceName, setDeviceName] = useState('');
  const [deviceError, setDeviceError] = useState('');
  const [registeringDevice, setRegisteringDevice] = useState(false);

  const [loginData, setLoginData] = useState(null);

function redirectUser(data) {
  // Admin y Superadmin ingresan siempre al dashboard principal.
  if (data.user?.is_super_admin || data.user?.role === 'ADMIN') {
    router.push('/admin');
    return;
  }

  const socialWorksAccess = data.modules?.find(
    (module) => module.code === 'SOCIAL_WORKS'
  );
  if (data.user?.role === 'SUCURSAL' && socialWorksAccess?.access_level === 'USER') {
    router.push('/sucursal');
    return;
  }
  router.push('/');
}

  async function validateExistingDevice(data, deviceUuid) {
    const branchId = data.branch?.id;

    if (!branchId) {
      return true;
    }

    const storedName =
      localStorage.getItem('gdpsoft_device_name') ||
      'Dispositivo registrado';

    const storedType =
      localStorage.getItem('gdpsoft_device_type') ||
      'OTHER';

    try {
      const response = await fetch('/api/devices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          device_uuid: deviceUuid,
          branch_id: branchId,
          device_name: storedName,
          device_type: storedType,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.ok) {
        return false;
      }

      return true;
    } catch (err) {
      console.error('Error validando dispositivo:', err);
      return false;
    }
  }

  async function continueAfterLogin(data) {
    const branchId = data.branch?.id;

    if (!branchId) {
      redirectUser(data);
      return;
    }

    const existingDeviceUuid = localStorage.getItem(
      'gdpsoft_device_uuid'
    );

    if (existingDeviceUuid) {
      const valid = await validateExistingDevice(
        data,
        existingDeviceUuid
      );

      if (valid) {
        redirectUser(data);
        return;
      }

      localStorage.removeItem('gdpsoft_device_uuid');
      localStorage.removeItem('gdpsoft_device_name');
      localStorage.removeItem('gdpsoft_device_type');
    }

    setLoginData(data);
    setSubmitting(false);
    setShowDeviceModal(true);
  }

  async function handleSubmit(event) {
    event.preventDefault();

    setError('');

    const cleanUsername = username.trim();

    if (!cleanUsername || !password) {
      setError('Ingresá tu usuario y contraseña.');
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: cleanUsername,
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(
          data?.error || 'Usuario o contraseña incorrectos.'
        );
      }

      sessionStorage.setItem(
        'gdpsoft_user',
        JSON.stringify(data.user)
      );

      sessionStorage.setItem(
        'gdpsoft_branch',
        JSON.stringify(data.branch ?? null)
      );

      sessionStorage.setItem(
        'gdpsoft_modules',
        JSON.stringify(data.modules ?? [])
      );

      if (data.session?.access_token) {
        sessionStorage.setItem(
          'gdpsoft_access_token',
          data.session.access_token
        );
      }

      if (data.session?.refresh_token) {
        sessionStorage.setItem(
          'gdpsoft_refresh_token',
          data.session.refresh_token
        );
      }

      await continueAfterLogin(data);
    } catch (err) {
      console.error('Error login:', err);

      setError(
        err?.message || 'No se pudo iniciar sesión.'
      );

      setSubmitting(false);
    }
  }

  async function handleRegisterDevice(event) {
    event.preventDefault();

    setDeviceError('');

    if (!loginData?.branch?.id) {
      setDeviceError(
        'No se pudo determinar la sucursal del usuario.'
      );
      return;
    }

    if (!deviceName.trim()) {
      setDeviceError(
        'Indicá un nombre o número para identificar este dispositivo.'
      );
      return;
    }

    setRegisteringDevice(true);

    try {
      const deviceUuid = crypto.randomUUID();

      const response = await fetch('/api/devices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          device_uuid: deviceUuid,
          branch_id: loginData.branch.id,
          device_name: deviceName.trim(),
          device_type: deviceType,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(
          data?.error || 'No se pudo registrar el dispositivo.'
        );
      }

      localStorage.setItem(
        'gdpsoft_device_uuid',
        data.device.device_uuid
      );

      localStorage.setItem(
        'gdpsoft_device_name',
        data.device.device_name
      );

      localStorage.setItem(
        'gdpsoft_device_type',
        data.device.device_type
      );

      sessionStorage.setItem(
        'gdpsoft_device',
        JSON.stringify(data.device)
      );

      setShowDeviceModal(false);

      redirectUser(loginData);
    } catch (err) {
      console.error('Error registrando dispositivo:', err);

      setDeviceError(
        err?.message || 'No se pudo registrar el dispositivo.'
      );
    } finally {
      setRegisteringDevice(false);
    }
  }

  return (
    <>
      <main className="gdpLoginPage">
        <div className="gdpLoginPharmacy" />

        <div className="gdpLoginShape gdpLoginShapeOne" />
        <div className="gdpLoginShape gdpLoginShapeTwo" />
        <div className="gdpLoginShape gdpLoginShapeThree" />

        <span className="gdpMedicalCross gdpCrossOne">+</span>
        <span className="gdpMedicalCross gdpCrossTwo">+</span>

        <div className="gdpLoginTopBrand">
          <span>FARMACIAS DEL PLATA</span>
          <small>TECNOLOGÍA QUE TE ACOMPAÑA</small>
        </div>

        <section className="gdpLoginScene">
          <div className="gdpBotArea">
            <img
              src="/images/bot-gdpsoft.png"
              alt="Asistente GDP Soft"
              className="gdpLoginBot"
            />

            <div className="gdpBotBubble">
              <span>¡Estoy disponible</span>
              <strong>para ayudarte!</strong>
            </div>
          </div>

          <div className="gdpLoginCard">
            <div className="gdpLoginHeader">
              <h1>
                Bienvenido a <span>GDP Soft</span>
              </h1>

              <p>
                Ingresá con tu usuario y contraseña
              </p>
            </div>

            <form
              className="gdpLoginForm"
              onSubmit={handleSubmit}
            >
              <div className="gdpLoginGroup">
                <label htmlFor="username">
                  Usuario
                </label>

                <div className="gdpLoginInput">
                  <span className="gdpLoginInputIcon">
                    <UserIcon />
                  </span>

                  <input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(event) =>
                      setUsername(event.target.value)
                    }
                    placeholder="Ingresá tu usuario"
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck="false"
                    autoFocus
                  />
                </div>
              </div>

              <div className="gdpLoginGroup">
                <label htmlFor="password">
                  Contraseña
                </label>

                <div className="gdpLoginInput">
                  <span className="gdpLoginInputIcon">
                    <LockIcon />
                  </span>

                  <input
                    id="password"
                    type={
                      showPassword
                        ? 'text'
                        : 'password'
                    }
                    value={password}
                    onChange={(event) =>
                      setPassword(event.target.value)
                    }
                    placeholder="Ingresá tu contraseña"
                    autoComplete="current-password"
                  />

                  <button
                    type="button"
                    className="gdpLoginEye"
                    onClick={() =>
                      setShowPassword(
                        (current) => !current
                      )
                    }
                    aria-label={
                      showPassword
                        ? 'Ocultar contraseña'
                        : 'Mostrar contraseña'
                    }
                  >
                    <EyeIcon visible={showPassword} />
                  </button>
                </div>
              </div>

              {error ? (
                <div
                  className="gdpLoginError"
                  role="alert"
                >
                  {error}
                </div>
              ) : null}

              <button
                type="submit"
                className="gdpLoginButton"
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <span
                      className="gdpLoginSpinner"
                      aria-hidden="true"
                    />
                    <span>Ingresando...</span>
                  </>
                ) : (
                  <>
                    <span>Ingresar</span>

                    <span className="gdpLoginArrow">
                      <ArrowIcon />
                    </span>
                  </>
                )}
              </button>
            </form>

            <div className="gdpLoginHelpTitle">
              <span />
              <p>¿Necesitás ayuda?</p>
              <span />
            </div>

            <button
              type="button"
              className="gdpLoginSupport"
            >
              <span className="gdpSupportIcon">
                <HeadsetIcon />
              </span>

              <span className="gdpSupportText">
                <strong>Contactar Soporte</strong>
                <small>Estamos para ayudarte</small>
              </span>

              <span className="gdpSupportArrow">
                ›
              </span>
            </button>
          </div>
        </section>

        <footer className="gdpLoginFooter">
          <span>GDP Soft</span>
          <i />
          <span>Farmacias del Plata</span>
          <i />
          <span>
            Transformando la gestión de tu farmacia
          </span>
        </footer>
      </main>

      {showDeviceModal ? (
        <div className="gdpDeviceModalBackdrop">
          <div
            className="gdpDeviceModal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="device-title"
          >
            <div className="gdpDeviceModalBadge">
              Primer ingreso desde este dispositivo
            </div>

            <h2 id="device-title">
              Identificar dispositivo
            </h2>

            <p className="gdpDeviceModalDescription">
              Estás ingresando a{' '}
              <strong>
                {loginData?.branch?.name}
              </strong>
              . Indicá qué dispositivo estás utilizando.
            </p>

            <form onSubmit={handleRegisterDevice}>
              <div className="gdpDeviceFieldGroup">
                <label>Tipo de dispositivo</label>

                <div className="gdpDeviceTypeGrid">
                  {DEVICE_TYPES.map((device) => {
                    const active =
                      deviceType === device.value;

                    return (
                      <button
                        key={device.value}
                        type="button"
                        className={
                          active
                            ? 'gdpDeviceTypeOption active'
                            : 'gdpDeviceTypeOption'
                        }
                        onClick={() =>
                          setDeviceType(device.value)
                        }
                      >
                        <span className="gdpDeviceTypeIcon">
                          <DeviceIcon
                            type={device.value}
                          />
                        </span>

                        <span>{device.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="gdpDeviceFieldGroup">
                <label htmlFor="device-name">
                  Nombre o número
                </label>

                <input
                  id="device-name"
                  value={deviceName}
                  onChange={(event) =>
                    setDeviceName(event.target.value)
                  }
                  placeholder={
                    deviceType === 'MOBILE'
                      ? 'Ej: Celular encargado'
                      : deviceType === 'TABLET'
                      ? 'Ej: Tablet mostrador'
                      : deviceType === 'PC'
                      ? 'Ej: Caja 1'
                      : 'Ej: Equipo administración'
                  }
                  autoFocus
                />

                <small>
                  Ejemplos: Caja 1, Caja 2, PC Mostrador,
                  Celular Encargado.
                </small>
              </div>

              {deviceError ? (
                <div
                  className="gdpDeviceError"
                  role="alert"
                >
                  {deviceError}
                </div>
              ) : null}

              <button
                type="submit"
                className="gdpDeviceRegisterButton"
                disabled={registeringDevice}
              >
                {registeringDevice
                  ? 'Registrando...'
                  : 'Registrar dispositivo'}
              </button>
            </form>

            <p className="gdpDevicePrivacy">
              Esta identificación se utiliza para separar
              correctamente las consultas realizadas desde
              distintos equipos de la sucursal.
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}
