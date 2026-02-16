let myChart;
const ctx = document.getElementById('financeChart').getContext('2d');
const mesesNomes = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

const API_BASE_URL = 'https://iadev-financeiro.vercel.app';

// Funções de Controle do Loader
function toggleLoader(show, text = "Processando...") {
    const loader = document.getElementById('loader-overlay');
    const loaderText = document.getElementById('loader-text');
    if (loader) {
        loaderText.innerText = text;
        loader.style.display = show ? 'flex' : 'none';
    }
}

async function awakeServer() {
    try {
        const res = await fetch(`${API_BASE_URL}/api/ping`);
        const data = await res.json();
        console.log("Status da API:", data.status);
    } catch (err) {
        console.warn("Servidor offline ou erro de CORS.");
    }
}

awakeServer();

async function handleLogin() {
    const usuario = document.getElementById('user-login').value;
    const senha = document.getElementById('pass-login').value;

    toggleLoader(true, "Autenticando...");
    try {
        const res = await fetch(`${API_BASE_URL}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usuario, senha })
        });

        if (res.ok) {
            const data = await res.json();
            localStorage.setItem('token', data.token);
            document.getElementById('login-screen').style.display = 'none';
            document.getElementById('welcome-modal').style.display = 'flex';
            init();
        } else {
            document.getElementById('login-error').style.display = 'block';
        }
    } catch (err) {
        alert("Erro de conexão com o Vercel.");
    } finally {
        toggleLoader(false);
    }
}

function logout() {
    localStorage.removeItem('token');
    location.reload();
}

function getAuthHeaders() {
    const token = localStorage.getItem('token');
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };
}

function switchTab(tab) {
    const dashTab = document.getElementById('tab-dashboard');
    const usersTab = document.getElementById('tab-users');
    const navDash = document.getElementById('nav-dashboard');
    const navUsers = document.getElementById('nav-users');

    if (tab === 'dashboard') {
        dashTab.style.display = 'block';
        usersTab.style.display = 'none';
        navDash.classList.add('active');
        navUsers.classList.remove('active');
        loadData();
    } else {
        dashTab.style.display = 'none';
        usersTab.style.display = 'block';
        navDash.classList.remove('active');
        navUsers.classList.add('active');
        listUsers();
    }
}

async function listUsers() {
    toggleLoader(true, "Carregando usuários...");
    try {
        const res = await fetch(`${API_BASE_URL}/api/usuarios`, { headers: getAuthHeaders() });
        const users = await res.json();
        const tbody = document.getElementById('lista-usuarios');
        tbody.innerHTML = '';

        users.forEach(u => {
            tbody.innerHTML += `
                <tr>
                    <td>${u.usuario}</td>
                    <td class="actions">
                        <button class="btn-action btn-edit" onclick="changePassword('${u._id}', '${u.usuario}')">
                            <i class="fas fa-key"></i> Senha
                        </button>
                        <button class="btn-action btn-delete" onclick="deleteUser('${u._id}', '${u.usuario}')">
                            <i class="fas fa-trash"></i> Excluir
                        </button>
                    </td>
                </tr>
            `;
        });
    } catch (err) { console.error(err); }
    finally { toggleLoader(false); }
}

async function registerUser() {
    const usuario = document.getElementById('new-username').value;
    const senha = document.getElementById('new-password').value;
    if (!usuario || !senha) return alert("Preencha todos os campos!");

    toggleLoader(true, "Cadastrando usuário...");
    try {
        const res = await fetch(`${API_BASE_URL}/api/usuarios`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ usuario, senha })
        });
        if (res.ok) {
            alert("Usuário cadastrado!");
            document.getElementById('new-username').value = '';
            document.getElementById('new-password').value = '';
            listUsers();
        }
    } catch (err) { console.error(err); }
    finally { toggleLoader(false); }
}

async function changePassword(id, nome) {
    const novaSenha = prompt(`Nova senha para ${nome}:`);
    if (!novaSenha) return;
    toggleLoader(true, "Atualizando senha...");
    try {
        const res = await fetch(`${API_BASE_URL}/api/usuarios/${id}`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({ novaSenha })
        });
        if (res.ok) alert("Senha alterada!");
    } catch (err) { console.error(err); }
    finally { toggleLoader(false); }
}

async function deleteUser(id, nome) {
    if(!confirm(`Excluir ${nome}?`)) return;
    toggleLoader(true, "Removendo usuário...");
    try {
        const res = await fetch(`${API_BASE_URL}/api/usuarios/${id}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        if (res.ok) listUsers();
    } catch (err) { console.error(err); }
    finally { toggleLoader(false); }
}

function setDataBaseMes() {
    const ano = document.getElementById('filtro-ano').value;
    const mesIndice = document.getElementById('filtro-mes').value;
    const mesFormatado = String(parseInt(mesIndice) + 1).padStart(2, '0');
    document.getElementById('data-registro').value = `${ano}-${mesFormatado}-01`;
}

function init() {
    const selectFiltroAno = document.getElementById('filtro-ano');
    const selectFiltroMes = document.getElementById('filtro-mes');
    const selectModalAno = document.getElementById('modal-ano');
    const selectModalMes = document.getElementById('modal-mes');
    if (!selectFiltroAno) return;

    const dataAtual = new Date();
    const anoAtual = dataAtual.getFullYear();
    const mesAtual = dataAtual.getMonth();

    [selectFiltroAno, selectModalAno].forEach(s => {
        s.innerHTML = '';
        for (let a = 2025; a <= anoAtual + 5; a++) {
            let opt = document.createElement('option');
            opt.value = a; opt.innerText = a;
            s.appendChild(opt);
        }
    });

    [selectFiltroMes, selectModalMes].forEach(s => {
        s.innerHTML = '';
        mesesNomes.forEach((n, i) => {
            let opt = document.createElement('option');
            opt.value = i; opt.innerText = n;
            s.appendChild(opt);
        });
    });

    selectFiltroAno.value = selectModalAno.value = anoAtual;
    selectFiltroMes.value = selectModalMes.value = mesAtual;
    setDataBaseMes();
}

function closeWelcomeModal() {
    document.getElementById('filtro-ano').value = document.getElementById('modal-ano').value;
    document.getElementById('filtro-mes').value = document.getElementById('modal-mes').value;
    document.getElementById('welcome-modal').style.display = 'none';
    setDataBaseMes();
    loadData();
}

async function loadData() {
    if (!localStorage.getItem('token')) return;
    toggleLoader(true, "Sincronizando dados...");
    try {
        const res = await fetch(`${API_BASE_URL}/api/transacoes`, { headers: getAuthHeaders() });
        if (res.status === 401) return logout();
        const data = await res.json();
        const anoAlvo = parseInt(document.getElementById('filtro-ano').value);
        const mesAlvo = parseInt(document.getElementById('filtro-mes').value);
        const filtrada = data.filter(t => {
            const p = t.data.split('-');
            return parseInt(p[0]) === anoAlvo && (parseInt(p[1]) - 1) === mesAlvo;
        });
        updateUI(filtrada);
        renderTable(filtrada);
    } catch (e) { console.error(e); }
    finally { toggleLoader(false); }
}

function renderTable(transacoes) {
    const tbody = document.getElementById('lista-transacoes');
    tbody.innerHTML = '';
    transacoes.sort((a,b) => b.data.localeCompare(a.data)).forEach(t => {
        const p = t.data.split('-');
        tbody.innerHTML += `
            <tr>
                <td>${p[2]}/${p[1]}/${p[0]}</td>
                <td>${t.descricao}</td>
                <td><span class="type-badge badge-${t.tipo}">${t.tipo}</span></td>
                <td style="color: ${t.tipo === 'gastos' ? 'var(--danger)' : 'var(--success)'}">${t.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                <td class="actions">
                    <button class="btn-action btn-edit" onclick='editTransaction(${JSON.stringify(t)})'><i class="fas fa-edit"></i></button>
                    <button class="btn-action btn-delete" onclick="deleteTransaction('${t._id}')"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `;
    });
}

function updateUI(transacoes) {
    let d = 0, o = 0, g = 0;
    transacoes.forEach(t => {
        if(t.tipo === 'dizimo') d += t.valor;
        else if(t.tipo === 'oferta') o += t.valor;
        else g += t.valor;
    });
    const s = (d + o) - g;
    document.getElementById('total-receita').innerText = (d + o).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    document.getElementById('total-despesa').innerText = g.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const elS = document.getElementById('saldo-total');
    elS.innerText = s.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    elS.style.color = s >= 0 ? 'var(--success)' : 'var(--danger)';

    if (myChart) myChart.destroy();
    myChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Dízimos', 'Ofertas', 'Gastos'],
            datasets: [{ data: [d, o, g], backgroundColor: ['#10b981', '#34d399', '#ef4444'], borderRadius: 12 }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
}

async function addTransaction() {
    const id = document.getElementById('edit-id').value;
    const desc = document.getElementById('desc').value;
    const valor = document.getElementById('valor').value;
    const tipo = document.getElementById('tipo').value;
    const dataManual = document.getElementById('data-registro').value;
    if (!desc || !valor || !dataManual) return alert("Campos vazios!");

    const url = id ? `${API_BASE_URL}/api/transacoes/${id}` : `${API_BASE_URL}/api/transacoes`;
    const method = id ? 'PUT' : 'POST';

    toggleLoader(true, id ? "Atualizando registro..." : "Salvando registro...");
    try {
        const response = await fetch(url, { 
            method, headers: getAuthHeaders(), 
            body: JSON.stringify({ descricao: desc, valor, tipo, dataManual }) 
        });
        if (response.ok) { resetForm(); loadData(); }
    } catch (err) { console.error(err); }
    finally { toggleLoader(false); }
}

function editTransaction(t) {
    document.getElementById('form-title').innerText = "Editar Registro";
    document.getElementById('edit-id').value = t._id;
    document.getElementById('desc').value = t.descricao;
    document.getElementById('valor').value = t.valor;
    document.getElementById('tipo').value = t.tipo;
    document.getElementById('data-registro').value = t.data;
    document.getElementById('btn-submit').innerHTML = '<i class="fas fa-check"></i> ATUALIZAR';
    document.getElementById('btn-cancel').style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetForm() {
    document.getElementById('form-title').innerText = "Novo Registro";
    document.getElementById('edit-id').value = ''; 
    document.getElementById('desc').value = ''; 
    document.getElementById('valor').value = '';
    setDataBaseMes();
    document.getElementById('btn-submit').innerHTML = '<i class="fas fa-plus"></i> SALVAR';
    document.getElementById('btn-cancel').style.display = 'none';
}

async function deleteTransaction(id) {
    if(!confirm("Excluir transação?")) return;
    toggleLoader(true, "Excluindo transação...");
    try {
        await fetch(`${API_BASE_URL}/api/transacoes/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
        loadData();
    } catch (err) { console.error(err); }
    finally { toggleLoader(false); }
}

if(localStorage.getItem('token')) { 
    document.getElementById('login-screen').style.display = 'none'; 
    init(); 
    loadData(); 
}