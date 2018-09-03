module.exports = function override(config, env) {
    //do stuff with the webpack config...
    console.log(`Environment: ${env}`)

    if(env === "production") {
        config.externals = {
            "react" : "React",
            "redux" : "Redux",
            "react-redux" : "ReactRedux"
        }
    }


    return config;
}