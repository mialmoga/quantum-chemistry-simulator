import numpy as np
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d import Axes3D

# --- Operadores de Bajo Consumo (Velvet-Ready) ---
def compute_gradient(field):
    return np.array(np.gradient(field, axis=(0, 1, 2)), dtype=np.complex64)

def compute_laplacian(field):
    lap = np.zeros_like(field)
    for i in range(3):
        lap += np.gradient(np.gradient(field, axis=i), axis=i)
    return lap

def compute_curl(field):
    fx, fy, fz = field[...,0], field[...,1], field[...,2]
    curl = np.zeros_like(field)
    curl[...,0] = np.gradient(fz, axis=1) - np.gradient(fy, axis=2)
    curl[...,1] = np.gradient(fx, axis=2) - np.gradient(fz, axis=0)
    curl[...,2] = np.gradient(fy, axis=0) - np.gradient(fx, axis=1)
    return curl

# --- El Motor de un solo paso (Resiliencia Analógica) ---
def step_evolve_clean(psi, dt, params):
    rho = np.sum(np.abs(psi)**2, axis=-1).astype(np.float32) + 1e-9
    log_rho = np.log(rho)
    grad_log_rho = compute_gradient(log_rho)
    
    V_prime = params['lambda'] * (np.expand_dims(rho, -1) - params['phi0']**2)
    phase_coupling = params['gamma'] * np.exp(-1j * params['theta_vac_0'])
    
    curl_psi = compute_curl(psi)
    snap = params['eta'] * compute_curl(np.cross(psi, curl_psi))
    
    bohm = -(params['bohm_coeff'] / 4.0) * (compute_laplacian(log_rho) + 0.5 * np.sum(np.real(grad_log_rho)**2, axis=0))
    
    dpsi = -1j * (
        -0.5 * compute_laplacian(psi) + 
        V_prime * psi + 
        phase_coupling * psi + 
        snap + 
        np.expand_dims(bohm, -1) * psi
    )
    return psi + dt * dpsi

# --- Main con Visualización Final ---
if __name__ == "__main__":
    N = 32
    params = {'lambda': 0.8, 'phi0': 1.0, 'eta': 0.5, 'bohm_coeff': 1.0, 'gamma': 0.15, 'theta_vac_0': 0.0}
    
    # Inicialización
    x = np.linspace(-1, 1, N)
    X, Y, Z = np.meshgrid(x, x, x, indexing='ij')
    r2 = X**2 + Y**2 + Z**2
    psi = np.zeros((N, N, N, 3), dtype=np.complex64)
    psi[..., 0] = -Y * np.exp(-10 * r2)
    psi[..., 1] = X * np.exp(-10 * r2)
    psi[..., 2] = 0.5 * Z * np.exp(-10 * r2)
    
    print("--- Corriendo motor de supervivencia... ---")
    for step in range(301):
        psi = step_evolve_clean(psi, 0.005, params)
        if step % 100 == 0:
            print(f"Paso {step} | Estabilidad OK")

    # --- PLOT FINAL (El momento de la verdad) ---
    print("\nGenerando plot final...")
    rho = np.sum(np.abs(psi)**2, axis=-1)
    # Usamos la fase promedio de los 3 componentes (Identidad Analógica)
    avg_phase = np.angle(np.sum(psi, axis=-1))
    
    mask = rho > (np.max(rho) * 0.2) # Solo vemos el corazón del grumo
    
    fig = plt.figure(figsize=(10, 7), facecolor='black')
    ax = fig.add_subplot(111, projection='3d', facecolor='black')
    
    p = ax.scatter(X[mask], Y[mask], Z[mask], 
                  c=avg_phase[mask], 
                  cmap='twilight', # Un mapa de color cíclico para fases
                  s=rho[mask]*50, 
                  alpha=0.6, 
                  edgecolors='none')
    
    ax.set_axis_off()
    plt.title("Atohmeter V5: Solitón de Fase Coherente", color='white')
    plt.show()
