# Horizon Save Studio

Editor visual, em português, para alterar créditos e giros em um backup extraído do Forza Horizon 2 no formato Azimuth.

## Usar

1. Abra `index.html` em um navegador Chromium (Chrome ou Edge).
2. Escolha a pasta `player-1` do backup extraído.
3. Ajuste créditos e giros e selecione **Exportar save editado**.
4. O navegador baixa `forza-horizon-2-save-editado.zip`. Extraia o ZIP e use a pasta `player-1` resultante ao restaurar o backup.

Os arquivos são lidos e processados localmente no navegador. O app não envia o save para um servidor.

## Formato esperado

O editor procura a revisão mais recente dentro de `User_*/revisions/*`, com `ProfileData`, `SaveState` e manifesto `commit`. Atualiza os valores `Credits` e `TombolaState/Spins`, recalcula os hashes SHA-256 e tamanhos no manifesto e preserva os outros arquivos do backup.

## Desenvolvimento

Não há etapa de build nem dependências de runtime. Sirva esta pasta com qualquer servidor estático para desenvolvimento; o seletor de pasta funciona melhor em Chrome ou Edge.

