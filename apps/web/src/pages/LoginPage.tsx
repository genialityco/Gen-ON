import { useState } from 'react';
import { Anchor, Button, Center, Paper, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth';
import { Navigate } from 'react-router-dom';
import { auth } from '../lib/firebase';
import { useAuth } from '../auth/AuthProvider';

const AUTH_ERRORS: Record<string, string> = {
  'auth/invalid-credential': 'Correo o contraseña incorrectos',
  'auth/too-many-requests': 'Demasiados intentos. Espera unos minutos.',
  'auth/user-disabled': 'La cuenta está deshabilitada',
};

export function LoginPage() {
  const { user, loading } = useAuth();
  const [busy, setBusy] = useState(false);
  const form = useForm({
    initialValues: { email: '', password: '' },
    validate: {
      email: (v) => (/^\S+@\S+$/.test(v) ? null : 'Correo inválido'),
      password: (v) => (v ? null : 'Escribe tu contraseña'),
    },
  });

  if (!loading && user) return <Navigate to="/" replace />;

  const submit = form.onSubmit(async ({ email, password }) => {
    setBusy(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (e: any) {
      notifications.show({ color: 'red', message: AUTH_ERRORS[e.code] ?? 'No se pudo iniciar sesión' });
    } finally {
      setBusy(false);
    }
  });

  const resetPassword = async () => {
    const email = form.values.email.trim();
    if (form.validateField('email').hasError) return;
    try {
      await sendPasswordResetEmail(auth, email);
    } catch {
      // Igual respuesta exista o no la cuenta
    }
    notifications.show({
      color: 'teal',
      message: `Si ${email} tiene cuenta, le llegará un correo para definir la contraseña.`,
    });
  };

  return (
    <Center mih="100vh" bg="gray.0" p="md">
      <Paper withBorder shadow="sm" p="xl" w="100%" maw={400}>
        <form onSubmit={submit}>
          <Stack>
            <div>
              <Title order={2}>
                Gen<Text span c="teal" inherit>.ON</Text>
              </Title>
              <Text c="dimmed" size="sm">
                Seguimiento de pacientes por WhatsApp
              </Text>
            </div>
            <TextInput label="Correo" autoComplete="email" {...form.getInputProps('email')} />
            <PasswordInput
              label="Contraseña"
              autoComplete="current-password"
              {...form.getInputProps('password')}
            />
            <Button type="submit" loading={busy}>
              Ingresar
            </Button>
            <Anchor component="button" type="button" size="sm" onClick={resetPassword}>
              ¿Olvidaste tu contraseña o es tu primer ingreso?
            </Anchor>
          </Stack>
        </form>
      </Paper>
    </Center>
  );
}
