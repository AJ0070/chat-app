const oracledb = require('oracledb');
require('dotenv').config();

async function connectToOracleDB() {
    let connection;
    try {
        connection = await oracledb.getConnection({
            user: 'ADMIN',
            password: 'Jashmann123@',
            connectString: `(description= (retry_count=20)(retry_delay=3)(address=(protocol=tcps)(port=1522)(host=adb.ap-mumbai-1.oraclecloud.com))(connect_data=(service_name=g3f36b4ffcb76d0_blogdb_low.adb.oraclecloud.com))(security=(ssl_server_dn_match=yes)))`
        });
        console.log('Successfully connected to Oracle Autonomous Database');
        const result = await connection.execute('SELECT sysdate FROM dual');
        console.log(result.rows[0]);
    } catch (err) {
        console.error(err);
    } finally {
        if (connection) {
            try {
                await connection.close();
            } catch (err) {
                console.error(err);
            }
        }
    }
}

connectToOracleDB();