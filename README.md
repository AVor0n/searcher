# Sequential Searcher

Sequential Searcher - это расширение для VS Code, которое предоставляет мощные возможности последовательного поиска с поддержкой буферов и исключающего поиска.

## Возможности

- **Последовательный поиск**: Выполняйте поиск поэтапно, сохраняя промежуточные результаты в буферы
- **Поиск по регулярным выражениям**: Используйте мощь регулярных выражений для поиска
- **Исключающий поиск**: Находите файлы, которые НЕ содержат определенный текст или шаблон
- **Поиск по именам файлов**: Ищите по путям и именам файлов вместо их содержимого
- **Буферы результатов**: Сохраняйте результаты поиска в буферы для дальнейшего использования

## Использование

### Открытие панели поиска

1. Нажмите `Ctrl+Shift+P` (Windows/Linux) или `Cmd+Shift+P` (Mac) для открытия палитры команд
2. Введите "Sequential Search: Open Search Panel" и выберите эту команду

### Выполнение поиска

1. Введите текст или регулярное выражение в поле поиска
2. Используйте переключатели для настройки поиска:
   - **Exclude**: Найти файлы, которые НЕ содержат шаблон
   - **File Names**: Искать в именах файлов вместо их содержимого
3. Нажмите кнопку "Search" или клавишу Enter

### Работа с буферами

- Нажмите кнопку "+" для сохранения текущих результатов в новый буфер
- Нажмите на номер буфера для активации этого буфера
- Когда буфер активен, поиск выполняется только среди файлов в этом буфере
- Нажмите "Clear All" для очистки всех буферов

### Просмотр результатов

- Список найденных файлов отображается в нижней части панели
- Нажмите на файл, чтобы открыть его в редакторе
- При открытии файла все вхождения поискового запроса будут подсвечены

## Примеры использования

### Пример 1: Поиск файлов с определенным текстом, но без другого текста

1. Введите первый шаблон (например, "function") и выполните поиск
2. Сохраните результаты в буфер, нажав "+"
3. Введите второй шаблон (например, "deprecated"), установите флажок "Exclude"
4. Выполните поиск - вы получите файлы, которые содержат "function", но не содержат "deprecated"

### Пример 2: Поиск по именам файлов с определенным расширением

1. Введите регулярное выражение (например, "\.tsx$")
2. Установите флажок "File Names"
3. Выполните поиск - вы получите все файлы с расширением .tsx

## Требования

- VS Code версии 1.98.0 или выше

## Настройки расширения

Расширение предоставляет следующие настройки:

- `sequentialSearcher.includePattern`: Шаблон для включения файлов в поиск (glob-шаблон)
- `sequentialSearcher.excludePattern`: Шаблон для исключения файлов из поиска (glob-шаблон)

## Известные проблемы

- Поиск в больших файлах может занимать продолжительное время
- При некорректном регулярном выражении поиск выполняется как обычный текстовый поиск

## Обратная связь и вклад в проект

Если у вас есть предложения по улучшению или вы нашли ошибку, пожалуйста, создайте issue в репозитории проекта.

## Лицензия

[MIT](LICENSE)
