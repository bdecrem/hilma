cmake_minimum_required(VERSION 3.5)
project(Oracle C)

# Retro68 provides add_application() via its toolchain file.
# Oracle is fully offline -- no nettcp/MacTCP (see oracle.c). The model and
# tokenizer are embedded as resources (oracle.r), so it is one self-contained app.
add_application(Oracle
    oracle.c
    gpt.c
    oracle.r
)

# -O2 is not cosmetic here: at -O0 every int8 multiply in the model's hot
# loop becomes a __mulsi3 library call (~4x slower). -ffunction-sections +
# gc-sections strips dead reference code (the old qsort top-p sampler etc).
target_compile_options(Oracle PRIVATE
    -O2 -fomit-frame-pointer -fno-strict-aliasing -ffunction-sections)

if(CMAKE_SYSTEM_NAME MATCHES Retro68)
    set_target_properties(Oracle PROPERTIES
        LINK_FLAGS "-Wl,-gc-sections -Wl,--mac-strip-macsbug")
endif()

# gpt.c uses sqrtf/expf/powf/sinf/cosf from the toolchain's software-float libm.
target_link_libraries(Oracle m)
