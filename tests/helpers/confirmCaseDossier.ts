import { fireEvent, screen } from '@testing-library/react';

/**
 * Confirma la ficha del caso como lo haría el abogado: elige la parte que representa y marca la confirmación.
 * Recorre las partes detectadas hasta dar con una compatible con el rol del escrito (la interfaz rechaza las
 * del lado contrario); si el expediente no trae partes, escribe una a mano.
 */
export function confirmCaseDossierInUi(fallbackName = 'Parte Representada de Prueba') {
  const select = screen.getByLabelText('Parte que representas') as HTMLSelectElement;
  const confirm = () => screen.getByLabelText('Confirmar ficha del caso') as HTMLInputElement;
  const detected = Array.from(select.options).filter((option) => option.value && option.value !== '__otra__');
  for (const option of detected) {
    fireEvent.change(select, { target: { value: option.value } });
    if (!confirm().disabled) break;
  }
  if (confirm().disabled) {
    fireEvent.change(select, { target: { value: '__otra__' } });
    fireEvent.change(screen.getByLabelText('Nombre de la parte representada'), { target: { value: fallbackName } });
  }
  fireEvent.click(confirm());
}
