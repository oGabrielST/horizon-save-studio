# Horizon 2 Save Editor

Editor visual para ajustar créditos e giros em um save do Forza Horizon 2 no formato Azimuth.

## Usar

1. Abra `index.html` em um navegador Chromium (Chrome ou Edge).
2. Escolha a pasta `player-1` do backup extraído.
3. Ajuste créditos e giros e selecione **Exportar save editado**.
4. O navegador baixa `forza-horizon-2-save-editado.zip`. Extraia o ZIP para obter a pasta `player-1` editada.
5. Com o Azimuth e o jogo fechados, faça uma cópia da pasta ativa e substitua `data/titles/1A96545B/saves/player-1` pela pasta editada. Alterar somente `data/saves-backup-*` não muda o save que o jogo carrega.

O editor funciona como uma página estática. O save é aberto pelo navegador e não é enviado a um serviço de processamento.

## Formato esperado

O editor procura a revisão mais recente dentro de `User_*/revisions/*`, com `ProfileData`, `SaveState` e manifesto `commit`. Atualiza os valores `Credits` e `TombolaState/Spins`, recalcula os hashes SHA-256 e tamanhos no manifesto e preserva os outros arquivos do backup.

## Desenvolvimento

Não há etapa de build nem dependências de runtime. Sirva esta pasta com qualquer servidor estático para desenvolvimento; o seletor de pasta funciona melhor em Chrome ou Edge.

## Publicação

O workflow de GitHub Actions em `.github/workflows/pages.yml` publica o conteúdo deste repositório no GitHub Pages quando o Pages está habilitado em Settings → Pages. No GitHub Free, Pages requer repositório público; um repositório privado requer upgrade de plano.

