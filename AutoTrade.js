const puppeteer = require('puppeteer-extra');
const fs = require('fs').promises;

// Функция для установки куков
const setCookies = async (page, cookieFilePath) => {
    try {
        const data = await fs.readFile(cookieFilePath, 'utf8');
        const rawCookies = JSON.parse(data);
        const cookies = rawCookies.map(cookie => ({
            name: cookie.name,
            value: cookie.value,
            domain: cookie.domain,
            path: cookie.path,
            httpOnly: cookie.httpOnly,
            secure: cookie.secure,
            sameSite: cookie.sameSite === null ? 'Lax' : cookie.sameSite,
        }));
        await page.setCookie(...cookies);
        console.log(`Куки установлены из файла ${cookieFilePath}`);
    } catch (error) {
        console.error(`Ошибка чтения файла с куками ${cookieFilePath}:`, error);
        return false;
    }
    return true;
};

// Функция для получения количества карт в инвентаре
const getInventoryCardCount = async (page) => {
    await page.waitForSelector('.anime-cards__item-wrapper'); // Ожидаем, пока элемент появится
    const cards = await page.$$('.anime-cards__item-wrapper');
    return cards.length;
};

// Функция для задержки
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Функция для отправки и принятия обмена для указанного ранга - меняем на ваше расположение хрома
const handleTradeForRank = async (rank, cookieFilePathSend, cookieFilePathReceive) => {
    const browser1 = await puppeteer.launch({
        headless: true,
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    });

    const page1 = await browser1.newPage();

    if (!(await setCookies(page1, cookieFilePathSend))) {
        await page1.close(); // Закрываем страницу перед закрытием браузера
        await browser1.close();
        return false;
    }
    // Меняем ссылку на ваш профиль - куда будут отправляьтся карты 
    try {
        await page1.goto(`https://animestars.org/user/YourUsername/cards/?rank=${rank}`, { waitUntil: 'networkidle2' });
        console.log(`Переход на страницу карт для ранга ${rank} выполнен`);

        // Цикл обмена, пока не останется 2 или менее карт
        while (true) {
            const cardCount = await getInventoryCardCount(page1);
            if (cardCount <= 2) {
                console.log(`Недостаточно карт для обмена, переходим к следующему рангу ${rank}`);

                // Закрываем страницу и браузер при недостаточном количестве карт
                await page1.close();
                await browser1.close();

                break; // Завершаем цикл, если карт 2 или меньше
            }

            try {
                await page1.waitForSelector('.anime-cards__item-wrapper:nth-of-type(1)', { visible: true });
                await page1.click('.anime-cards__item-wrapper:nth-of-type(1)');
                console.log(`Кликнули на первую карту ранга ${rank}`);

                await page1.waitForSelector('.anime-cards__controls a[class*="trade-propose-"]', { visible: true });
                const proposeTradeButton = await page1.$('.anime-cards__controls a[class*="trade-propose-"]');
                await proposeTradeButton.click();
                console.log('Кликнули на "Предложить обмен"');

                // Проверка лимита обменов
                const limitMessageSelector = '.message-info__title';
                try {
                    await page1.waitForSelector(limitMessageSelector, { visible: true, timeout: 3000 });
                    const limitReachedTitle = await page1.$eval(limitMessageSelector, el => el.textContent.trim());

                    if (limitReachedTitle.includes('Внимание! Достигнут лимит')) {
                        console.log(`Достигнут лимит обменов для файла куков ${cookieFilePathSend}. Переходим к следующему файлу куков.`);
                        
                        await page1.close();
                        await browser1.close();
                        return; // Выход из функции, чтобы переключиться на другой файл куков
                    }
                } catch (limitError) {
                    console.log('Лимит обменов не достигнут. Продолжаем.');
                }
                
                await page1.waitForSelector('.trade__inventory-list', { visible: true });
                await delay(100); // Задержка 100 мс после загрузки элемента

                // Получаем элементы карт для обмена
                const cards = await page1.$$('.trade__inventory-list .trade__inventory-item');
                const totalCardsToSelect = cards.length;

                console.log(`Доступно карт для выбора: ${totalCardsToSelect}`);
                // Если доступно менее 2 карт для обмена, завершаем цикл
                if (totalCardsToSelect < 2) {
                    console.error('Недостаточно карт для обмена, завершаем выполнение для этого ранга.');

                    // Закрываем страницу и браузер при недостаточном количестве карт
                    await page1.close();
                    await browser1.close();

                    break; // Завершаем цикл
                }

                // Кликаем на доступные карты для обмена
                for (let i = 0; i < Math.min(totalCardsToSelect, 3); i++) {
                    await cards[i].click();
                    console.log(`Кликнули на карту для обмена ${i + 1}`);
                    await delay(100); // Задержка 100 мс после каждого клика
                }

                await page1.waitForSelector('.trade__send-trade-btn', { visible: true });
                const sendTradeButton = await page1.$('.trade__send-trade-btn');
                await sendTradeButton.click();
                console.log('Отправили обмен');

                // Закрываем страницу после отправки обмена
                await page1.close();
                await browser1.close();

                // Запуск второго браузера для принятия обмена -  меняем на ваше расположение хрома
                const browser2 = await puppeteer.launch({
                    headless: true,
                    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
                });
                const page2 = await browser2.newPage();

                if (!(await setCookies(page2, cookieFilePathReceive))) {
                    await page2.close(); // Закрываем страницу перед закрытием браузера
                    await browser2.close();
                    return;
                }

                await page2.goto('https://animestars.org/trades/', { waitUntil: 'networkidle2' });

                // Ожидание загрузки списка обменов
                try {
                    const tradeListSelector = '.trade__list';
                    await page2.waitForSelector(tradeListSelector, { visible: true });
                    console.log('Список обменов загружен');
                } catch (error) {
                    console.error('Ошибка при ожидании загрузки списка обменов:', error);
                    await page2.close();
                    await browser2.close();
                    return;
                }

                // Нажимаем на первый обмен
                try {
                    const firstTradeSelector = '.trade__list-item';
                    await page2.waitForSelector(firstTradeSelector, { visible: true });
                    const firstTrade = await page2.$(firstTradeSelector);
                    if (firstTrade) {
                        await firstTrade.click();
                        console.log('Кликнули на первый обмен');
                    } else {
                        console.error('Первый обмен не найден');
                        await page2.close();
                        await browser2.close();
                        return;
                    }
                } catch (error) {
                    console.error('Ошибка при клике на первый обмен:', error);
                    await page2.close();
                    await browser2.close();
                    return;
                }

                // Нажимаем "Принять обмен"
                try {
                    const acceptTradeButtonSelector = '.trade__accepted-btn'; // Обновленный селектор
                    await page2.waitForSelector(acceptTradeButtonSelector, { visible: true, timeout: 10000 }); // Ждем появления кнопки
                    const acceptTradeButton = await page2.$(acceptTradeButtonSelector);
                    
                    // Проверяем, активна ли кнопка
                    const isDisabled = await page2.evaluate(button => button.disabled, acceptTradeButton);
                    if (isDisabled) {
                        console.error('Кнопка "Принять обмен" отключена');
                        await page2.close(); // Закрываем страницу перед закрытием браузера
                        await browser2.close();
                        return;
                    } else {
                        // Кликаем с использованием evaluate, чтобы гарантировать, что срабатывает событие клика
                        await delay(500);
                        await page2.evaluate(button => button.click(), acceptTradeButton);
                        console.log('Кликнули на "Принять обмен"');
                    }
                } catch (error) {
                    console.error('Ошибка при клике на "Принять обмен":', error);
                    await page2.close(); // Закрываем страницу перед закрытием браузера
                    await browser2.close();
                    return;
                }

                // Ожидание модального окна подтверждения
                try {
                    const confirmationModalSelector = '.ui-dialog'; // Селектор для модального окна
                    await page2.waitForSelector(confirmationModalSelector, { visible: true, timeout: 10000 });
                    console.log('Модальное окно подтверждения загружено');
                } catch (error) {
                    console.error('Ошибка при ожидании загрузки модального окна подтверждения:', error);
                    await browser2.close();
                    return;
                }

                // Нажимаем кнопку "Да"
                try {
                    const confirmButtonSelector = '.ui-dialog-buttonset button'; // Селектор для кнопок в модальном окне
                    await page2.waitForSelector(confirmButtonSelector, { visible: true });

                    // Получаем все кнопки и ищем нужную по тексту
                    const buttons = await page2.$$(confirmButtonSelector);
                    for (const button of buttons) {
                        const buttonText = await page2.evaluate(el => el.textContent.trim(), button);
                        if (buttonText === "Подтвердить") {
                            await delay(200); // Задержка в 200 миллисекунд (0.2 секунды)
                            await button.click();
                            console.log('Кликнули на "Подтвердить" в модальном окне подтверждения');
                            break; // Прекращаем цикл, если нашли и кликнули
                        }
                    }
                } catch (error) {
                    console.error('Ошибка при клике на "Подтвердить":', error);
                }

                // Закрываем страницы после завершения
                await page2.close();
                await browser2.close();
                console.log(`Завершен обмен для ранга ${rank}. Переход к повторной проверке ранга ${rank}`);
                await handleTradeForRank(rank, cookieFilePathSend, cookieFilePathReceive);

            } catch (error) {
                console.error('Ошибка при выполнении обмена:', error);
                // Закрываем страницы, если произошла ошибка
                await page1.close();
                await browser1.close();
                return; // Завершаем выполнение для этого ранга
            }
        }
    } catch (error) {
        console.error(`Ошибка в процессе обработки ранга ${rank}:`);
    } finally {
        // Убедимся, что браузер 1 закрывается в любом случае
        await browser1.close();
    }
};

// Основной код
(async () => {
    const ranks = ['A', 'B', 'C', 'D', 'E'];
    // Меняем на свои файлы куки
    const cookieFiles = [
        'cookies1.json',
        'cookies2.json',
    ];

    for (const rank of ranks) {
        console.log(`Обработка ранга: ${rank}`);

        for (const cookieFilePathSend of cookieFiles) {
            const cookieFilePathReceive = 'cookies.json'; // Куки для получения обмена
            console.log(`Используем файл куков для отправки: ${cookieFilePathSend}`);

            await handleTradeForRank(rank, cookieFilePathSend, cookieFilePathReceive);
        }
    }
})();
